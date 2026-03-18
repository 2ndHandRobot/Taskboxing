# Manual Scheduling & Event Completion Design

**Date:** 2026-03-18
**Scope:** Manual task scheduling (task → Google Calendar event) and event completion status

---

## Goal

Allow users to manually schedule tasks onto Google Calendar from within the task editor, and mark any calendar event (whether a Task Boxer-created entry or a regular meeting) as completed.

## Architecture

Extend the existing `calendar-store` and `tasks-store` with scheduling and completion capabilities. Cross-store two-way sync is handled in UI-layer hooks (`useCompleteEvent`, `useCompleteTask`), following the existing pattern. No new service layer — that will come in Phase 5 (smart scheduling).

**Tech stack:** React + Zustand stores, Google Calendar API (existing `calendarApi`), `chrome.storage.local` for completion persistence.

---

## 1. Data Model

### `AppSettings` (settings-store)

```ts
defaultSchedulingCalendarId?: string  // user's chosen calendar for task scheduling
```

Persisted in `chrome.storage.sync` alongside other settings.

### `CalendarStore` state

```ts
completedEventIds: string[]  // IDs of events marked complete by the user
```

Loaded from `chrome.storage.local` on store init. Written back on every `completeEvent` / `uncompleteEvent` call.

### `TaskMetadata` — no changes

`calendarEventId?: string` and `calendarId?: string` already exist and are used as-is.

### Completion source of truth

| Event type | Completed when |
|---|---|
| Task Boxer-linked event (has `linkedTaskId`) | `tasks[event.linkedTaskId]?.status === 'completed'` |
| Regular calendar event | `completedEventIds.includes(event.id)` |

Linked events are not added to `completedEventIds` — their state is derived from the task.

---

## 2. Manual Scheduling

### 2a. Settings — "Scheduling" section

A new section in the Settings screen:

- **Default calendar** dropdown — lists all user calendars (from `calendarStore.calendars`)
- **"Create Taskboxing calendar"** button — calls `calendarApi.createCalendar({ summary: 'Taskboxing' })`, then sets the new calendar's ID as `defaultSchedulingCalendarId`. If a calendar named "Taskboxing" already exists in the user's list, this button is not shown; the calendar appears in the dropdown instead.

`defaultSchedulingCalendarId` defaults to the user's primary calendar if unset.

### 2b. TaskEditorForm — Calendar section

**No event linked** (current stub state):

```
[Schedule on calendar]   ← enabled button, replaces disabled stub
```

Clicking expands the `ScheduleForm` inline beneath it.

**Event already linked:**

```
[Event title] · [Calendar name]
[Reschedule]  [Unschedule]
```

- **Reschedule** → expands `ScheduleForm` pre-populated with existing event's date/start/end
- **Unschedule** → calls `calendarApi.deleteEvent()`, then clears `calendarEventId` and `calendarId` from task metadata via `updateTask()`

### 2c. `ScheduleForm` component

**File:** `src/components/tasks/ScheduleForm.tsx`

Inline form rendered inside `TaskEditorForm`:

```
[Calendar ▾]  [Date]  [Start ▾]  [End ▾]  [Schedule / Update]  [Cancel]
──────────────────────────────────────────────────────────────────────────
DayPreview (appears once date is selected)
```

**Defaults:**
- Calendar: `settings.defaultSchedulingCalendarId`
- Date: task's `due` date if set, otherwise today
- Start time: no default (user must pick)
- End time: start + `task.metadata.estimatedMinutes` if set, otherwise start + 60 min (computed once start is chosen)

**Day preview (`DayPreview` sub-component):**
- Appears when a date is selected
- Shows all events from all visible calendars on that date, sorted by start time
- Read-only: time range + event title + colour dot
- Compact list, max ~6 items visible with overflow scroll

**On "Schedule" (new event):**
1. Call `calendarApi.createTaskEvent(calendarId, task.id, task.taskListId, task.title, start, end)`
2. Call `updateTask({ ...task, metadata: { ...task.metadata, calendarEventId: event.id, calendarId } })`
3. Collapse form, show `LinkedEventInfo`

**On "Update" (rescheduling existing event):**
1. Call `calendarApi.updateEvent({ ...existingEvent, start, end })` — patches date/time, preserves attendees and other fields
2. Call `updateTask()` only if `calendarId` changed
3. Collapse form, show updated `LinkedEventInfo`

---

## 3. Event Completion

### 3a. Calendar store additions

```ts
// State
completedEventIds: string[]

// Actions
completeEvent: (eventId: string) => void
uncompleteEvent: (eventId: string) => void
isEventCompleted: (event: ExtendedCalendarEvent, tasks: Record<string, ExtendedTask>) => boolean
```

`completeEvent` / `uncompleteEvent` update state and persist to `chrome.storage.local` immediately.

`isEventCompleted` is a pure helper:
```ts
function isEventCompleted(event, tasks) {
  if (event.linkedTaskId) return tasks[event.linkedTaskId]?.status === 'completed'
  return completedEventIds.includes(event.id)
}
```

### 3b. `useCompleteEvent` hook

**File:** `src/hooks/useCompleteEvent.ts`

```ts
function useCompleteEvent() {
  const { completeEvent, uncompleteEvent } = useCalendarStore()
  const { completeTask, reopenTask } = useTasksStore()

  return {
    completeEvent: async (event: ExtendedCalendarEvent) => {
      completeEvent(event.id)
      if (event.linkedTaskId && event.linkedTaskListId) {
        await completeTask(event.linkedTaskListId, event.linkedTaskId)
      }
    },
    uncompleteEvent: async (event: ExtendedCalendarEvent) => {
      uncompleteEvent(event.id)
      if (event.linkedTaskId && event.linkedTaskListId) {
        await reopenTask(event.linkedTaskListId, event.linkedTaskId)
      }
    },
  }
}
```

### 3c. `useCompleteTask` hook

**File:** `src/hooks/useCompleteTask.ts`

Wraps the existing `completeTask` / `reopenTask` calls to add event sync:

```ts
function useCompleteTask() {
  const { completeTask, reopenTask, tasks } = useTasksStore()
  const { completeEvent, uncompleteEvent } = useCalendarStore()

  return {
    completeTask: async (task: ExtendedTask) => {
      await completeTask(task.taskListId, task.id)
      if (task.metadata.calendarEventId) {
        completeEvent(task.metadata.calendarEventId)
      }
    },
    uncompleteTask: async (task: ExtendedTask) => {
      await reopenTask(task.taskListId, task.id)
      if (task.metadata.calendarEventId) {
        uncompleteEvent(task.metadata.calendarEventId)
      }
    },
  }
}
```

Existing call sites that use `completeTask` directly (TaskItem, DayView, WeekView, ListView) are updated to use this hook.

### 3d. Calendar view — completed event appearance

Completed events in all calendar views (Month, Week, Day):

- Background: grey (`#e2e8f0`) replacing the calendar colour
- Title: strikethrough, muted text colour (`#94a3b8`)
- Opacity: 0.7

**Hover state (all event chips):**
- A small checkbox appears on the left edge of the chip
- Uncompleted event: empty checkbox; clicking calls `completeEvent`
- Completed event: checked checkbox; clicking calls `uncompleteEvent`

The checkbox is only shown on hover to keep the calendar uncluttered when scanning.

### 3e. EventPopover additions

The existing `EventPopover` component gains:

- A "Mark done" button (green tint) when event is not completed
- A "Mark incomplete" button (slate tint) when event is completed
- If the event has a `linkedTaskId`, show the linked task title with its current status beneath the event details

---

## 4. Files to create / modify

| File | Change |
|---|---|
| `src/components/tasks/ScheduleForm.tsx` | **Create** — inline scheduling form |
| `src/components/tasks/DayPreview.tsx` | **Create** — read-only day event list for scheduling form |
| `src/hooks/useCompleteEvent.ts` | **Create** — two-way event completion hook |
| `src/hooks/useCompleteTask.ts` | **Create** — two-way task completion hook |
| `src/stores/calendar-store.ts` | **Modify** — add `completedEventIds`, `completeEvent`, `uncompleteEvent`, `isEventCompleted`, load/persist from `chrome.storage.local` |
| `src/stores/settings-store.ts` | **Modify** — add `defaultSchedulingCalendarId` to `AppSettings` |
| `src/services/api/calendar-api.ts` | **Modify** — add `createCalendar(options)` method for Taskboxing calendar creation |
| `src/components/tasks/TaskEditorForm.tsx` | **Modify** — enable Calendar section, add ScheduleForm, Reschedule/Unschedule buttons |
| `src/components/settings/SettingsView.tsx` | **Modify** — add Scheduling section with calendar picker + Taskboxing creation |
| `src/components/calendar/EventPopover.tsx` | **Modify** — add Mark done/incomplete button, linked task status |
| `src/components/calendar/DayCell.tsx` | **Modify** — add hover checkbox, completed visual state |
| `src/components/calendar/WeekView.tsx` | **Modify** — add hover checkbox, completed visual state |
| `src/components/calendar/DayView.tsx` | **Modify** — add hover checkbox on events, completed visual state |
| `src/components/tasks/TaskItem.tsx` | **Modify** — use `useCompleteTask` hook |
| `src/components/tasks/TaskItemEditor.tsx` | **Modify** — use `useCompleteTask` hook |

---

## 5. Out of scope

- Smart scheduling / auto-suggest time slots (Phase 5)
- Cross-device sync for `completedEventIds` (future version)
- Recurring event handling (creating one instance vs. all instances)
- Attendee management or event colour customisation
