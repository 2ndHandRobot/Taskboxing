import { create } from 'zustand'
import { calendarApi } from '../services/api/calendar-api'
import { idb } from '../services/storage/indexeddb'
import type { CalendarInfo, ExtendedCalendarEvent, CalendarEventTime, ExtendedTask } from '../types/task.types'
import { chromeStorage } from '../services/storage/chrome-storage'

interface CalendarStore {
  // State
  calendars: CalendarInfo[]
  events: Record<string, ExtendedCalendarEvent>
  completedEventIds: string[]
  selectedCalendarIds: string[]
  viewStart: string
  viewEnd: string
  isLoading: boolean
  error: string | null

  // Selectors
  getEventsByCalendar: (calendarId: string) => ExtendedCalendarEvent[]
  getEventsInRange: (start: string, end: string) => ExtendedCalendarEvent[]
  isEventCompleted: (event: ExtendedCalendarEvent, tasks: Record<string, ExtendedTask>) => boolean

  // Actions
  loadFromCache: () => Promise<void>
  syncCalendars: () => Promise<void>
  syncEvents: (calendarId: string, timeMin: string, timeMax: string) => Promise<void>
  syncAllEvents: () => Promise<void>
  createEvent: (
    calendarId: string,
    event: Omit<ExtendedCalendarEvent, 'id' | 'calendarId'>,
  ) => Promise<ExtendedCalendarEvent>
  createTaskEvent: (
    calendarId: string,
    taskId: string,
    taskListId: string,
    summary: string,
    start: CalendarEventTime,
    end: CalendarEventTime,
  ) => Promise<ExtendedCalendarEvent>
  addEvent: (event: ExtendedCalendarEvent) => Promise<void>
  updateEvent: (event: ExtendedCalendarEvent) => Promise<ExtendedCalendarEvent>
  deleteEvent: (calendarId: string, eventId: string) => Promise<void>
  completeEvent: (eventId: string) => Promise<void>
  uncompleteEvent: (eventId: string) => Promise<void>
  setViewWindow: (start: string, end: string) => void
  setSelectedCalendarIds: (ids: string[]) => void
  clearError: () => void
}

// Default view: current month
const now = new Date()
const defaultViewStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
const defaultViewEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString()

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  calendars: [],
  events: {},
  completedEventIds: [],
  selectedCalendarIds: [],
  viewStart: defaultViewStart,
  viewEnd: defaultViewEnd,
  isLoading: false,
  error: null,

  // ── Selectors ────────────────────────────────────────────────────────────────

  getEventsByCalendar: (calendarId) => {
    return Object.values(get().events).filter((e) => e.calendarId === calendarId)
  },

  getEventsInRange: (start, end) => {
    return Object.values(get().events).filter((event) => {
      const eventStart = event.start.dateTime ?? event.start.date ?? ''
      const eventEnd = event.end.dateTime ?? event.end.date ?? ''
      return eventStart < end && eventEnd > start
    })
  },

  isEventCompleted: (event, tasks) => {
    if (event.linkedTaskId) return tasks[event.linkedTaskId]?.status === 'completed'
    return get().completedEventIds.includes(event.id)
  },

  // ── Actions ──────────────────────────────────────────────────────────────────

  loadFromCache: async () => {
    try {
      const [cached, completedEventIds] = await Promise.all([
        idb.getAllEvents(),
        chromeStorage.getCompletedEventIds(),
      ])
      const eventMap: Record<string, ExtendedCalendarEvent> = {}
      for (const event of cached) {
        eventMap[event.id] = event
      }
      set({ events: eventMap, completedEventIds })
    } catch (err) {
      console.error('Failed to load events from cache:', err)
    }
  },

  syncCalendars: async () => {
    set({ isLoading: true, error: null })
    try {
      const calendars = await calendarApi.listCalendars()
      set({ calendars, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load calendars'
      set({ isLoading: false, error: message })
    }
  },

  syncEvents: async (calendarId, timeMin, timeMax) => {
    set({ isLoading: true, error: null })
    try {
      const events = await calendarApi.listEvents(calendarId, { timeMin, timeMax, singleEvents: true })
      await idb.saveEvents(events)

      set((state) => {
        const updated = { ...state.events }
        // Remove stale events for this calendar in the synced range
        for (const [id, event] of Object.entries(updated)) {
          if (event.calendarId === calendarId) {
            const start = event.start.dateTime ?? event.start.date ?? ''
            if (start >= timeMin && start < timeMax) delete updated[id]
          }
        }
        for (const event of events) {
          updated[event.id] = event
        }
        return { events: updated, isLoading: false }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync events'
      set({ isLoading: false, error: message })
    }
  },

  syncAllEvents: async () => {
    const { selectedCalendarIds, calendars, viewStart, viewEnd, syncEvents } = get()
    const idsToSync = selectedCalendarIds.length > 0
      ? selectedCalendarIds
      : calendars.map((c) => c.id)

    for (const id of idsToSync) {
      await syncEvents(id, viewStart, viewEnd)
    }
  },

  createEvent: async (calendarId, event) => {
    const created = await calendarApi.createEvent(calendarId, event)
    await idb.saveEvent(created)
    set((state) => ({ events: { ...state.events, [created.id]: created } }))
    return created
  },

  createTaskEvent: async (calendarId, taskId, taskListId, summary, start, end) => {
    const created = await calendarApi.createTaskEvent(calendarId, taskId, taskListId, summary, start, end)
    await idb.saveEvent(created)
    set((state) => ({ events: { ...state.events, [created.id]: created } }))
    return created
  },

  addEvent: async (event) => {
    await idb.saveEvent(event)
    set((state) => ({ events: { ...state.events, [event.id]: event } }))
  },

  updateEvent: async (event) => {
    const updated = await calendarApi.updateEvent(event)
    await idb.saveEvent(updated)
    set((state) => ({ events: { ...state.events, [updated.id]: updated } }))
    return updated
  },

  deleteEvent: async (calendarId, eventId) => {
    await calendarApi.deleteEvent(calendarId, eventId)
    await idb.deleteEvent(eventId)
    set((state) => {
      const updated = { ...state.events }
      delete updated[eventId]
      return { events: updated }
    })
  },

  completeEvent: async (eventId) => {
    const ids = [...new Set([...get().completedEventIds, eventId])]
    set({ completedEventIds: ids })
    await chromeStorage.saveCompletedEventIds(ids)
  },

  uncompleteEvent: async (eventId) => {
    const ids = get().completedEventIds.filter(id => id !== eventId)
    set({ completedEventIds: ids })
    await chromeStorage.saveCompletedEventIds(ids)
  },

  setViewWindow: (start, end) => set({ viewStart: start, viewEnd: end }),

  setSelectedCalendarIds: (ids) => set({ selectedCalendarIds: ids }),

  clearError: () => set({ error: null }),
}))
