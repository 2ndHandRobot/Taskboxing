// ─── Time Constraints ────────────────────────────────────────────────────────

export type TimeConstraint =
  | { type: 'anytime' }
  | { type: 'work_hours_only' }
  | { type: 'before_work' }
  | { type: 'after_work' }
  | { type: 'not_during_work' }
  | { type: 'fixed_time'; time: string }          // ISO 8601 datetime
  | { type: 'time_window'; start: string; end: string } // ISO 8601 datetimes
  | { type: 'before_time'; time: string }         // ISO 8601 time (HH:MM)
  | { type: 'after_time'; time: string }          // ISO 8601 time (HH:MM)

// ─── Recurrence ──────────────────────────────────────────────────────────────

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval: number              // e.g. every 2 weeks
  daysOfWeek?: number[]         // 0=Sun, 6=Sat
  dayOfMonth?: number
  monthOfYear?: number
  endDate?: string              // ISO 8601 date
  occurrences?: number          // max occurrences
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

export interface TaskDependency {
  taskId: string
  type: DependencyType
  lagMinutes?: number           // delay after dependency satisfied
}

// ─── Time Tracking ────────────────────────────────────────────────────────────

export interface TimeEntry {
  startTime: string             // ISO 8601 datetime
  endTime?: string              // ISO 8601 datetime (null if running)
  durationMinutes?: number
  note?: string
}

// ─── Tags & Priority ─────────────────────────────────────────────────────────

export type Priority = 'none' | 'low' | 'medium' | 'high' | 'critical'

// ─── Extended Task Metadata ───────────────────────────────────────────────────
// Stored as JSON encoded in Google Tasks `notes` field after ---METADATA--- delimiter

export interface TaskMetadata {
  version: number               // schema version for migrations
  priority: Priority
  tags: string[]
  estimatedMinutes?: number
  progressPercent: number       // 0–100
  timeConstraint: TimeConstraint
  dependencies: TaskDependency[]
  timeEntries: TimeEntry[]
  calendarEventId?: string      // linked Google Calendar event
  calendarId?: string           // which calendar the event is in
  recurrence?: RecurrenceRule
  templateId?: string
  parentTaskId?: string         // for subtask nesting
  sortOrder?: number            // manual ordering within a list
  color?: string                // hex color
}

// ─── Extended Task ────────────────────────────────────────────────────────────
// Google Tasks API task + our metadata

export interface ExtendedTask {
  // Google Tasks native fields
  id: string
  taskListId: string
  title: string
  notes?: string                // raw notes (includes metadata block)
  status: 'needsAction' | 'completed'
  due?: string                  // RFC 3339 date (date-only)
  completed?: string            // RFC 3339 datetime
  deleted?: boolean
  hidden?: boolean
  links?: Array<{ type: string; description: string; link: string }>
  updated?: string              // RFC 3339 datetime
  selfLink?: string
  etag?: string
  kind?: string
  position?: string
  parent?: string               // Google Tasks native parent (shallow)

  // Decoded metadata (not stored in Google Tasks directly)
  metadata: TaskMetadata
  userNotes: string             // notes without the metadata block
}

// ─── Task List ────────────────────────────────────────────────────────────────

export interface ExtendedTaskList {
  id: string
  title: string
  selfLink?: string
  updated?: string
  etag?: string
  kind?: string
}

// ─── Google Calendar Types ────────────────────────────────────────────────────

export interface CalendarInfo {
  id: string
  summary: string
  description?: string
  backgroundColor?: string
  foregroundColor?: string
  accessRole: string
  primary?: boolean
  selected?: boolean
}

export interface CalendarEventTime {
  dateTime?: string             // ISO 8601 datetime (timed events)
  date?: string                 // YYYY-MM-DD (all-day events)
  timeZone?: string
}

export interface ExtendedCalendarEvent {
  // Google Calendar native fields
  id: string
  calendarId: string
  summary: string
  description?: string
  start: CalendarEventTime
  end: CalendarEventTime
  status?: 'confirmed' | 'tentative' | 'cancelled'
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

  // Linked task (if this event was created by Task Boxer)
  linkedTaskId?: string
  linkedTaskListId?: string
}

// ─── Sync State ──────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

export interface SyncState {
  lastSyncTime?: string         // ISO 8601 datetime
  status: SyncStatus
  error?: string
  pendingOperations: number
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const TAG_COLOUR_SWATCHES = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#eab308', // yellow
  '#a855f7', // purple
  '#f97316', // orange
  '#14b8a6', // teal
  '#ec4899', // pink
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#f43f5e', // rose
] as const

export type TagColour = (typeof TAG_COLOUR_SWATCHES)[number]

export interface Tag {
  id: string          // slug, e.g. "design"
  name: string        // display name, e.g. "Design"
  colour: TagColour   // one of the 12 preset hex values
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface WorkHours {
  start: string                 // HH:MM
  end: string                   // HH:MM
  days: number[]                // 0=Sun, 6=Sat
}

export interface AppSettings {
  workHours: WorkHours
  defaultTaskListId?: string
  defaultCalendarId?: string
  defaultTimeConstraint: TimeConstraint
  defaultEstimateMinutes?: number
  theme: 'light' | 'dark' | 'system'
  firstDayOfWeek: 0 | 1         // 0=Sun, 1=Mon
  timeFormat: '12h' | '24h'
  notificationsEnabled: boolean
  notificationLeadMinutes: number
  autoScheduleEnabled: boolean
  syncIntervalMinutes: number
  tags: Tag[]                   // global tag registry
}

export const DEFAULT_SETTINGS: AppSettings = {
  workHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
  defaultTimeConstraint: { type: 'anytime' },
  theme: 'system',
  firstDayOfWeek: 1,
  timeFormat: '12h',
  notificationsEnabled: true,
  notificationLeadMinutes: 15,
  autoScheduleEnabled: true,
  syncIntervalMinutes: 15,
  tags: [],
}
