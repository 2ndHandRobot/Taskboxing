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
defaultSchedulingCalendarId?: string
// When undefined, falls back to the calendar where CalendarInfo.primary === true.
// Resolved at scheduling time, not stored as a fallback.
```

Persisted in `chrome.storage.sync` alongside other settings.

### `CalendarStore` state

```ts
completedEventIds: string[]  // IDs of non-linked events marked complete by the user
```

Loaded from `chrome.storage.local` on store init. Written back on every `completeEvent` / `uncompleteEvent` call.

**Important:** `completedEventIds` is only used for events that have no `linkedTaskId`. Linked events derive their completed state from their task.

### `TaskMetadata` — no changes

`calendarEventId?: string` and `calendarId?: string` already exist and are used as-is.

### Completion source of truth

| Event type | Completed when |
|---|---|
| Task Boxer-linked event (has `linkedTaskId`) | `tasks[event.linkedTaskId]?.status === 'completed'` |
| Regular calendar event (no `linkedTaskId`) | `completedEventIds.includes(event.id)` |

Linked events are **never** added to `completedEventIds` — their state is derived solely from the linked task.

---

## 2. Manual Scheduling

### 2a. Settings — "Scheduling" section

A new section in the Settings screen:

- **Default calendar** dropdown — lists all user calendars (from `calendarStore.calendars`)
- **"Create Taskboxing calendar"** button — calls `calendarApi.createCalendar({ summary: 'Taskboxing', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })`, then sets the new calendar's ID as `defaultSchedulingCalendarId`. If `defaultSchedulingCalendarId` is already set and matches a calendar in `calendarStore.calendars`, the button is not shown (the calendar appears selected in the dropdown instead).

> **Note:** Detection of an existing "Taskboxing" calendar uses the stored `defaultSchedulingCalendarId`, not name-matching. Name-matching against `calendarStore.calendars` is unreliable — the user may have created a "Taskboxing" calendar on another device before installing the extension. If no `defaultSchedulingCalendarId` is stored, the "Create Taskboxing calendar" button is always shown.

### 2b. `calendarApi.createCalendar()` — new method

```ts
createCalendar(options: { summary: string; timeZone: string }): Promise<CalendarInfo>
// POST /calendar/v3/calendars
// Body: { summary, timeZone }
// Returns the created calendar as CalendarInfo (parsed via toCalendarInfo helper)
```

### 2c. TaskEditorForm — Calendar section

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

**Error handling:**
- If `createTaskEvent` succeeds but `updateTask` fails → surface error toast; the orphaned GCal event is left in place and the user is shown a message: "Event created but could not be saved to task — try rescheduling."
- If `deleteEvent` succeeds but `updateTask` fails → surface error toast; show "Event deleted but task not updated — refresh may be needed." The stale `calendarEventId` on the task will point to a non-existent event, which `LinkedEventInfo` handles gracefully (already shows "Linked event (not loaded)").
- Network errors on either call → show error inline in the form, leave state unchanged.

### 2d. `ScheduleForm` component

**File:** `src/components/tasks/ScheduleForm.tsx`

Inline form rendered inside `TaskEditorForm`:

```
[Calendar ▾]  [Date]  [Start ▾]  [End ▾]  [Schedule / Update]  [Cancel]
──────────────────────────────────────────────────────────────────────────
DayPreview (appears once date is selected)
```

**Defaults:**
- Calendar: `settings.defaultSchedulingCalendarId` (falls back to primary calendar if unset)
- Date: task's `due` date if set, otherwise today
- Start time: no default (user must pick; Schedule button disabled until start is set)
- End time: start + `task.metadata.estimatedMinutes` if set, otherwise start + 60 min (computed once start is chosen)

**Day preview (`DayPreview` sub-component, `src/components/tasks/DayPreview.tsx`):**
- Appears when a date is selected
- Shows all events from all visible calendars on that date, sorted by start time
- Read-only: time range + event title + colour dot
- Compact list, max ~6 items visible with scroll

**On "Schedule" (new event):**
1. Call `calendarApi.createTaskEvent(calendarId, task.id, task.taskListId, task.title, start, end)`
2. On success: call `updateTask({ ...task, metadata: { ...task.metadata, calendarEventId: event.id, calendarId } })`
3. On `updateTask` failure: surface error (see 2c error handling), do not collapse form
4. On full success: collapse form, show `LinkedEventInfo`

**On "Update" (rescheduling existing event):**
1. Call `calendarApi.patchEvent(existingEvent.calendarId, existingEvent.id, { start, end })` — PATCH rather than PUT to preserve attendees, reminders, and other fields not owned by Task Boxer. `start` and `end` here are `CalendarEventTime` objects sourced directly from `ScheduleForm` state (matching the `RawEvent` shape expected by `patchEvent`).
2. If `calendarId` changed (user picked a different calendar): delete old event and create new one via `createTaskEvent`, then update task metadata
3. Collapse form, show updated `LinkedEventInfo`

---

## 3. Event Completion

### 3a. Calendar store additions

```ts
// State
completedEventIds: string[]

// Actions
completeEvent: (eventId: string) => void      // only for non-linked events
uncompleteEvent: (eventId: string) => void    // only for non-linked events

// Store selector (has access to completedEventIds via store closure)
isEventCompleted: (event: ExtendedCalendarEvent, tasks: Record<string, ExtendedTask>) => boolean
```

`completeEvent` / `uncompleteEvent` update state and persist to `chrome.storage.local` immediately.

`isEventCompleted` is a store selector (defined alongside `getEventsByCalendar` etc.) so it can read `completedEventIds` from the store's `get()` scope:
```ts
isEventCompleted: (event, tasks) => {
  if (event.linkedTaskId) return tasks[event.linkedTaskId]?.status === 'completed'
  return get().completedEventIds.includes(event.id)
}
```

Components call it as `calendarStore.isEventCompleted(event, tasks)`. No parameter threading needed.

### 3b. `useCompleteEvent` hook

**File:** `src/hooks/useCompleteEvent.ts`

For linked events, completion is achieved solely by completing the task — the event's visual state then derives from the task. `completedEventIds` is never touched for linked events.

```ts
function useCompleteEvent() {
  const { completeEvent, uncompleteEvent } = useCalendarStore()
  const { completeTask, reopenTask } = useTasksStore()

  return {
    completeEvent: async (event: ExtendedCalendarEvent) => {
      if (event.linkedTaskId && event.linkedTaskListId) {
        // Completion state derives from task — only update the task
        await completeTask(event.linkedTaskListId, event.linkedTaskId)
      } else {
        // Non-linked event — track in local storage
        completeEvent(event.id)
      }
    },
    uncompleteEvent: async (event: ExtendedCalendarEvent) => {
      if (event.linkedTaskId && event.linkedTaskListId) {
        await reopenTask(event.linkedTaskListId, event.linkedTaskId)
      } else {
        uncompleteEvent(event.id)
      }
    },
  }
}
```

### 3c. `useCompleteTask` hook

**File:** `src/hooks/useCompleteTask.ts`

For tasks linked to a calendar event, completing the task is sufficient — `isEventCompleted` will reflect the new state via the task status. `completedEventIds` is not touched.

```ts
function useCompleteTask() {
  const { completeTask, reopenTask } = useTasksStore()

  return {
    completeTask: async (task: ExtendedTask) => {
      await completeTask(task.taskListId, task.id)
      // No need to write completedEventIds — linked event completion
      // is derived from task.status via isEventCompleted
    },
    uncompleteTask: async (task: ExtendedTask) => {
      await reopenTask(task.taskListId, task.id)
    },
  }
}
```

Existing `completeTask` call sites updated to use this hook: `TaskItem`, `DayCell`, `WeekView`, `DayView`.

> Note: `ListView` does not call `completeTask` directly — it renders `TaskItem` which handles completion. No change needed there.

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

Both buttons call `useCompleteEvent` / `useCompleteEvent.uncompleteEvent`.

---

## 4. Files to create / modify

| File | Change |
|---|---|
| `src/components/tasks/ScheduleForm.tsx` | **Create** — inline scheduling form |
| `src/components/tasks/DayPreview.tsx` | **Create** — read-only day event list for scheduling form |
| `src/hooks/useCompleteEvent.ts` | **Create** — event completion hook (two-way for linked events) |
| `src/hooks/useCompleteTask.ts` | **Create** — task completion hook |
| `src/stores/calendar-store.ts` | **Modify** — add `completedEventIds`, `completeEvent`, `uncompleteEvent`, load/persist from `chrome.storage.local` |
| `src/stores/settings-store.ts` | **Modify** — add `defaultSchedulingCalendarId` to `AppSettings` |
| `src/services/api/calendar-api.ts` | **Modify** — add `createCalendar()` and `patchEvent()` (if not already present) methods |
| `src/components/tasks/TaskEditorForm.tsx` | **Modify** — enable Calendar section, integrate ScheduleForm, add Reschedule/Unschedule buttons |
| `src/components/settings/SettingsView.tsx` | **Modify** — add Scheduling section with calendar picker + Taskboxing creation |
| `src/components/calendar/EventPopover.tsx` | **Modify** — add Mark done/incomplete button, linked task status |
| `src/components/calendar/DayCell.tsx` | **Modify** — add hover checkbox, completed visual state; use `useCompleteTask` hook |
| `src/components/calendar/WeekView.tsx` | **Modify** — add hover checkbox on events, completed visual state; use `useCompleteTask` for task chips |
| `src/components/calendar/DayView.tsx` | **Modify** — add hover checkbox on events, completed visual state; use `useCompleteTask` for task chips |
| `src/components/tasks/TaskItem.tsx` | **Modify** — use `useCompleteTask` hook |

---

## 5. Out of scope

- Smart scheduling / auto-suggest time slots (Phase 5)
- Cross-device sync for `completedEventIds` (future version)
- Recurring event handling (creating one instance vs. all instances)
- Attendee management or event colour customisation
