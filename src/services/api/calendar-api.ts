import { apiClient } from './api-client'
import type { CalendarInfo, ExtendedCalendarEvent, CalendarEventTime } from '../../types/task.types'

const BASE = 'https://www.googleapis.com/calendar/v3'

// ─── Raw API shapes ───────────────────────────────────────────────────────────

interface RawCalendar {
  id?: string
  summary?: string
  description?: string
  backgroundColor?: string
  foregroundColor?: string
  accessRole?: string
  primary?: boolean
  selected?: boolean
}

interface RawEvent {
  id?: string
  summary?: string
  description?: string
  start?: CalendarEventTime
  end?: CalendarEventTime
  status?: string
  colorId?: string
  recurrence?: string[]
  recurringEventId?: string
  updated?: string
  created?: string
  htmlLink?: string
  etag?: string
  kind?: string
  creator?: { email: string; displayName?: string }
  organizer?: { email: string; displayName?: string }
  attendees?: Array<{ email: string; displayName?: string; responseStatus: string }>
}

interface CalendarsListResponse {
  items?: RawCalendar[]
  nextPageToken?: string
}

interface EventsListResponse {
  items?: RawEvent[]
  nextPageToken?: string
  timeZone?: string
  summary?: string
}

// ─── Google Calendar API Wrapper ──────────────────────────────────────────────

export class CalendarApiService {
  private static instance: CalendarApiService

  private constructor() {}

  static getInstance(): CalendarApiService {
    if (!CalendarApiService.instance) {
      CalendarApiService.instance = new CalendarApiService()
    }
    return CalendarApiService.instance
  }

  // ── Calendars ───────────────────────────────────────────────────────────────

  async listCalendars(): Promise<CalendarInfo[]> {
    const calendars: CalendarInfo[] = []
    let pageToken: string | undefined

    do {
      const res = await apiClient.get<CalendarsListResponse>(`${BASE}/users/me/calendarList`, {
        maxResults: 250,
        ...(pageToken ? { pageToken } : {}),
      })

      for (const raw of res.items ?? []) {
        calendars.push({
          id: raw.id ?? '',
          summary: raw.summary ?? '',
          description: raw.description,
          backgroundColor: raw.backgroundColor,
          foregroundColor: raw.foregroundColor,
          accessRole: raw.accessRole ?? 'reader',
          primary: raw.primary,
          selected: raw.selected,
        })
      }
      pageToken = res.nextPageToken
    } while (pageToken)

    return calendars
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  /**
   * List events from a calendar within a time range.
   */
  async listEvents(
    calendarId: string,
    options: {
      timeMin?: string      // ISO 8601
      timeMax?: string      // ISO 8601
      updatedMin?: string   // ISO 8601
      singleEvents?: boolean
      orderBy?: 'startTime' | 'updated'
      maxResults?: number
    } = {},
  ): Promise<ExtendedCalendarEvent[]> {
    const events: ExtendedCalendarEvent[] = []
    let pageToken: string | undefined

    do {
      const params: Record<string, string | number | boolean | undefined> = {
        maxResults: options.maxResults ?? 250,
        singleEvents: options.singleEvents ?? true,
        orderBy: options.orderBy ?? 'startTime',
        ...(options.timeMin ? { timeMin: options.timeMin } : {}),
        ...(options.timeMax ? { timeMax: options.timeMax } : {}),
        ...(options.updatedMin ? { updatedMin: options.updatedMin } : {}),
        ...(pageToken ? { pageToken } : {}),
      }

      const res = await apiClient.get<EventsListResponse>(
        `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
        params,
      )

      for (const raw of res.items ?? []) {
        events.push(toExtendedEvent(raw, calendarId))
      }
      pageToken = res.nextPageToken
    } while (pageToken)

    return events
  }

  async getEvent(calendarId: string, eventId: string): Promise<ExtendedCalendarEvent> {
    const raw = await apiClient.get<RawEvent>(
      `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    )
    return toExtendedEvent(raw, calendarId)
  }

  async createEvent(
    calendarId: string,
    event: Omit<ExtendedCalendarEvent, 'id' | 'calendarId'>,
  ): Promise<ExtendedCalendarEvent> {
    const body = fromExtendedEvent(event)
    const raw = await apiClient.post<RawEvent>(
      `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      body,
    )
    return toExtendedEvent(raw, calendarId)
  }

  async updateEvent(event: ExtendedCalendarEvent): Promise<ExtendedCalendarEvent> {
    const body = fromExtendedEvent(event)
    const raw = await apiClient.put<RawEvent>(
      `${BASE}/calendars/${encodeURIComponent(event.calendarId)}/events/${event.id}`,
      body,
    )
    return toExtendedEvent(raw, event.calendarId)
  }

  async patchEvent(
    calendarId: string,
    eventId: string,
    patch: Partial<RawEvent>,
  ): Promise<ExtendedCalendarEvent> {
    const raw = await apiClient.patch<RawEvent>(
      `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      patch,
    )
    return toExtendedEvent(raw, calendarId)
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await apiClient.delete(
      `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    )
  }

  /**
   * Create a calendar event linked to a Task Boxer task.
   * Stores the task link in the event description.
   */
  async createTaskEvent(
    calendarId: string,
    taskId: string,
    taskListId: string,
    summary: string,
    start: CalendarEventTime,
    end: CalendarEventTime,
    description?: string,
  ): Promise<ExtendedCalendarEvent> {
    const linkedMarker = `[task-boxer:${taskListId}/${taskId}]`
    const fullDescription = description
      ? `${description}\n\n${linkedMarker}`
      : linkedMarker

    const event = await this.createEvent(calendarId, {
      summary,
      description: fullDescription,
      start,
      end,
      linkedTaskId: taskId,
      linkedTaskListId: taskListId,
    })

    return event
  }

  /**
   * Quick-check whether an event was created by Task Boxer.
   */
  isTaskBoxerEvent(event: ExtendedCalendarEvent): boolean {
    return !!event.linkedTaskId || (event.description?.includes('[task-boxer:') ?? false)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toExtendedEvent(raw: RawEvent, calendarId: string): ExtendedCalendarEvent {
  // Extract linked task info from description if present
  let linkedTaskId: string | undefined
  let linkedTaskListId: string | undefined

  const match = raw.description?.match(/\[task-boxer:([^/]+)\/([^\]]+)\]/)
  if (match) {
    linkedTaskListId = match[1]
    linkedTaskId = match[2]
  }

  return {
    id: raw.id ?? '',
    calendarId,
    summary: raw.summary ?? '',
    description: raw.description,
    start: raw.start ?? {},
    end: raw.end ?? {},
    status: raw.status as ExtendedCalendarEvent['status'],
    colorId: raw.colorId,
    recurrence: raw.recurrence,
    recurringEventId: raw.recurringEventId,
    updated: raw.updated,
    created: raw.created,
    htmlLink: raw.htmlLink,
    etag: raw.etag,
    kind: raw.kind,
    creator: raw.creator,
    organizer: raw.organizer,
    attendees: raw.attendees,
    linkedTaskId,
    linkedTaskListId,
  }
}

function fromExtendedEvent(
  event: Omit<ExtendedCalendarEvent, 'id' | 'calendarId'> | ExtendedCalendarEvent,
): RawEvent {
  return {
    summary: event.summary,
    description: event.description,
    start: event.start,
    end: event.end,
    status: event.status,
    colorId: event.colorId,
    recurrence: event.recurrence,
  }
}

// Export singleton
export const calendarApi = CalendarApiService.getInstance()
