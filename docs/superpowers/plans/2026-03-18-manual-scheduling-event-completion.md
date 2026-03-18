# Manual Scheduling & Event Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to schedule tasks onto Google Calendar from the task editor, and mark any calendar event as completed with two-way sync to linked tasks.

**Architecture:** Extend existing Zustand stores (calendar-store, settings-store) and calendar API service. Cross-store two-way sync handled in UI-layer hooks (`useCompleteTask`, `useCompleteEvent`). Event completion state persisted in `chrome.storage.local`. No test framework exists — verification is `npm run build` + manual check in Chrome.

**Tech Stack:** React 18 + TypeScript, Zustand v5, Tailwind CSS v4, `@crxjs/vite-plugin`, `chrome.storage.local`, Google Calendar API v3.

**Spec:** `docs/superpowers/specs/2026-03-18-manual-scheduling-event-completion-design.md`

---

## File Structure

**New files:**
- `src/hooks/useCompleteTask.ts` — wraps task completion, full-task API
- `src/hooks/useCompleteEvent.ts` — wraps event completion, two-way sync for linked events
- `src/components/settings/SettingsPanel.tsx` — settings overlay with Scheduling section
- `src/components/tasks/DayPreview.tsx` — read-only day event list for ScheduleForm
- `src/components/tasks/ScheduleForm.tsx` — inline scheduling form in TaskEditorForm

**Modified files:**
- `src/types/task.types.ts` — add `defaultSchedulingCalendarId` to `AppSettings`
- `src/services/api/calendar-api.ts` — add `createCalendar()` method
- `src/services/storage/chrome-storage.ts` — add `completedEventIds` persistence
- `src/stores/calendar-store.ts` — add `completedEventIds`, completion actions, `createTaskEvent`, `addEvent`
- `src/stores/ui-store.ts` — add `showSettings`, `toggleSettings`
- `src/components/tasks/TaskItem.tsx` — use `useCompleteTask`
- `src/components/tasks/TaskEditorForm.tsx` — enable Calendar section with ScheduleForm
- `src/components/calendar/DayCell.tsx` — event chip: hover checkbox + completion visual; task chip: `useCompleteTask`
- `src/components/calendar/WeekView.tsx` — event chip: hover checkbox + completion visual; task chip: `useCompleteTask`
- `src/components/calendar/DayView.tsx` — event chip: hover checkbox + completion visual; task chip: `useCompleteTask`
- `src/components/calendar/EventPopover.tsx` — mark done/incomplete + linked task info
- `src/components/layout/SideRail.tsx` — wire settings button
- `src/components/layout/Layout.tsx` — render SettingsPanel

---

## Task 1: Foundation — types and calendar API

**Files:**
- Modify: `src/types/task.types.ts:199-213`
- Modify: `src/services/api/calendar-api.ts:65-93`

- [ ] **Step 1: Add `defaultSchedulingCalendarId` to AppSettings**

Open `src/types/task.types.ts`. In the `AppSettings` interface, add one line after `defaultCalendarId?`:

```ts
  defaultCalendarId?: string
  defaultSchedulingCalendarId?: string  // ← add this line
  defaultTimeConstraint: TimeConstraint
```

`DEFAULT_SETTINGS` needs no change — the field is optional.

- [ ] **Step 2: Add `createCalendar()` to CalendarApiService**

Open `src/services/api/calendar-api.ts`. After the `listCalendars()` method (line 93), add:

```ts
  async createCalendar(options: { summary: string; timeZone: string }): Promise<CalendarInfo> {
    const raw = await apiClient.post<RawCalendar>(`${BASE}/calendars`, options)
    return {
      id: raw.id ?? '',
      summary: raw.summary ?? '',
      description: raw.description,
      backgroundColor: raw.backgroundColor,
      foregroundColor: raw.foregroundColor,
      accessRole: raw.accessRole ?? 'owner',
      primary: raw.primary,
      selected: raw.selected,
    }
  }
```

- [ ] **Step 3: Build**

```bash
cd /Users/daimyo/Documents/Programming/Projects/Task-Boxer
npm run build
```

Expected: build succeeds with no TypeScript errors. Zero new warnings about the added fields.

- [ ] **Step 4: Commit**

```bash
git add src/types/task.types.ts src/services/api/calendar-api.ts
git commit -m "feat: add defaultSchedulingCalendarId to settings and createCalendar API method"
```

---

## Task 2: Calendar store — completion state and new actions

**Files:**
- Modify: `src/services/storage/chrome-storage.ts:6-14`
- Modify: `src/stores/calendar-store.ts`

- [ ] **Step 1: Add completedEventIds to chrome-storage**

Open `src/services/storage/chrome-storage.ts`.

Add `completedEventIds` to the `KEYS` object:

```ts
const KEYS = {
  settings: 'settings',
  syncState: 'sync_state',
  taskLists: 'task_lists',
  calendars: 'calendars',
  selectedTaskListIds: 'selected_task_list_ids',
  selectedCalendarIds: 'selected_calendar_ids',
  lastSyncToken: 'last_sync_token',
  completedEventIds: 'completed_event_ids',   // ← add
} as const
```

After the `clearSyncToken` method (around line 127), add:

```ts
  // ── Completed Events ─────────────────────────────────────────────────────────

  async getCompletedEventIds(): Promise<string[]> {
    return (await this.get<string[]>(KEYS.completedEventIds)) ?? []
  }

  async saveCompletedEventIds(ids: string[]): Promise<void> {
    await this.set(KEYS.completedEventIds, ids)
  }
```

- [ ] **Step 2: Update CalendarStore interface**

Open `src/stores/calendar-store.ts`. At the top, add `ExtendedTask` to the type import:

```ts
import type { CalendarInfo, ExtendedCalendarEvent, CalendarEventTime, ExtendedTask } from '../types/task.types'
```

Add `chromeStorage` import below the existing imports:

```ts
import { chromeStorage } from '../services/storage/chrome-storage'
```

Replace the `CalendarStore` interface with:

```ts
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
```

- [ ] **Step 3: Add completedEventIds to initial state**

In the `create<CalendarStore>` call, add `completedEventIds: []` to the initial state object:

```ts
export const useCalendarStore = create<CalendarStore>((set, get) => ({
  calendars: [],
  events: {},
  completedEventIds: [],       // ← add
  selectedCalendarIds: [],
  viewStart: defaultViewStart,
  viewEnd: defaultViewEnd,
  isLoading: false,
  error: null,
```

- [ ] **Step 4: Add isEventCompleted selector**

After `getEventsInRange`, add:

```ts
  isEventCompleted: (event, tasks) => {
    if (event.linkedTaskId) return tasks[event.linkedTaskId]?.status === 'completed'
    return get().completedEventIds.includes(event.id)
  },
```

- [ ] **Step 5: Update loadFromCache to also load completedEventIds**

Replace the existing `loadFromCache` implementation:

```ts
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
```

- [ ] **Step 6: Add completeEvent and uncompleteEvent actions**

After `deleteEvent`, add:

```ts
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
```

- [ ] **Step 7: Add createTaskEvent and addEvent store actions**

After `createEvent`, add:

```ts
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
```

- [ ] **Step 8: Build**

```bash
npm run build
```

Expected: builds cleanly. No TypeScript errors on the new interface members.

- [ ] **Step 9: Commit**

```bash
git add src/services/storage/chrome-storage.ts src/stores/calendar-store.ts
git commit -m "feat: add event completion state and createTaskEvent to calendar store"
```

---

## Task 3: Completion hooks

**Files:**
- Create: `src/hooks/useCompleteTask.ts`
- Create: `src/hooks/useCompleteEvent.ts`

- [ ] **Step 1: Create useCompleteTask hook**

Create `src/hooks/useCompleteTask.ts`:

```ts
import { useTasksStore } from '../stores/tasks-store'
import type { ExtendedTask } from '../types/task.types'

export function useCompleteTask() {
  const { completeTask, reopenTask } = useTasksStore()

  return {
    completeTask: async (task: ExtendedTask) => {
      await completeTask(task.taskListId, task.id)
    },
    uncompleteTask: async (task: ExtendedTask) => {
      await reopenTask(task.taskListId, task.id)
    },
  }
}
```

- [ ] **Step 2: Create useCompleteEvent hook**

Create `src/hooks/useCompleteEvent.ts`:

```ts
import { useCalendarStore } from '../stores/calendar-store'
import { useTasksStore } from '../stores/tasks-store'
import type { ExtendedCalendarEvent } from '../types/task.types'

export function useCompleteEvent() {
  const { completeEvent, uncompleteEvent } = useCalendarStore()
  const { completeTask, reopenTask } = useTasksStore()

  return {
    completeEvent: async (event: ExtendedCalendarEvent) => {
      if (event.linkedTaskId && event.linkedTaskListId) {
        // State derives from task — only update the task
        await completeTask(event.linkedTaskListId, event.linkedTaskId)
      } else {
        await completeEvent(event.id)
      }
    },
    uncompleteEvent: async (event: ExtendedCalendarEvent) => {
      if (event.linkedTaskId && event.linkedTaskListId) {
        await reopenTask(event.linkedTaskListId, event.linkedTaskId)
      } else {
        await uncompleteEvent(event.id)
      }
    },
  }
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: builds cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCompleteTask.ts src/hooks/useCompleteEvent.ts
git commit -m "feat: add useCompleteTask and useCompleteEvent hooks"
```

---

## Task 4: Update task completion call sites

**Files:**
- Modify: `src/components/tasks/TaskItem.tsx`
- Modify: `src/components/calendar/DayCell.tsx`
- Modify: `src/components/calendar/WeekView.tsx`
- Modify: `src/components/calendar/DayView.tsx`

### TaskItem.tsx

- [ ] **Step 1: Replace store imports with hook**

In `src/components/tasks/TaskItem.tsx`:

Replace:
```ts
import { useTasksStore } from '../../stores/tasks-store'
```
With:
```ts
import { useCompleteTask } from '../../hooks/useCompleteTask'
```

- [ ] **Step 2: Replace store destructure and handler**

Replace:
```ts
  const { completeTask, reopenTask } = useTasksStore()
```
With:
```ts
  const { completeTask, uncompleteTask } = useCompleteTask()
```

Replace `handleToggleComplete`:
```ts
  async function handleToggleComplete(e: React.MouseEvent) {
    e.stopPropagation()
    if (isCompleted) {
      await uncompleteTask(task)
    } else {
      await completeTask(task)
    }
  }
```

### DayCell.tsx

- [ ] **Step 3: Add hook import and update task chip**

In `src/components/calendar/DayCell.tsx`, add:
```ts
import { useCompleteTask } from '../../hooks/useCompleteTask'
```

Replace:
```ts
  const { completeTask } = useTasksStore()
```
With:
```ts
  const { completeTask, uncompleteTask } = useCompleteTask()
```

Update the task chip `onClick`:
```ts
                <button
                  onClick={async e => {
                    e.stopPropagation()
                    if (task.status === 'needsAction') await completeTask(task)
                    else await uncompleteTask(task)
                  }}
```

Also remove `useTasksStore` from imports if no longer used (the `completeTask` was the only thing from it in DayCell — check for other uses first).

### WeekView.tsx

- [ ] **Step 4: Same pattern in WeekView**

In `src/components/calendar/WeekView.tsx`, add:
```ts
import { useCompleteTask } from '../../hooks/useCompleteTask'
```

Replace:
```ts
  const { completeTask } = useTasksStore()
```
With:
```ts
  const { completeTask, uncompleteTask } = useCompleteTask()
```

Update the task chip `onClick`:
```ts
                      onClick={async e => {
                        e.stopPropagation()
                        if (task.status === 'needsAction') await completeTask(task)
                        else await uncompleteTask(task)
                      }}
```

### DayView.tsx

- [ ] **Step 5: Same pattern in DayView**

In `src/components/calendar/DayView.tsx`, add:
```ts
import { useCompleteTask } from '../../hooks/useCompleteTask'
```

Replace:
```ts
  const { completeTask } = useTasksStore()
```
With:
```ts
  const { completeTask, uncompleteTask } = useCompleteTask()
```

Update the task chip `onClick`:
```ts
                  onClick={async e => {
                    e.stopPropagation()
                    if (task.status === 'needsAction') await completeTask(task)
                    else await uncompleteTask(task)
                  }}
```

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: builds cleanly.

- [ ] **Step 7: Commit**

```bash
git add src/components/tasks/TaskItem.tsx src/components/calendar/DayCell.tsx src/components/calendar/WeekView.tsx src/components/calendar/DayView.tsx
git commit -m "feat: migrate task completion call sites to useCompleteTask hook"
```

---

## Task 5: EventPopover — mark done / linked task info

**Files:**
- Modify: `src/components/calendar/EventPopover.tsx`

- [ ] **Step 1: Rewrite EventPopover with completion support**

Replace the entire content of `src/components/calendar/EventPopover.tsx`:

```tsx
import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import type { ExtendedCalendarEvent } from '../../types/task.types'
import { useCalendarStore } from '../../stores/calendar-store'
import { useTasksStore } from '../../stores/tasks-store'
import { useCompleteEvent } from '../../hooks/useCompleteEvent'

interface Props {
  event: ExtendedCalendarEvent
  onClose: () => void
}

export default function EventPopover({ event, onClose }: Props) {
  const { tasks } = useTasksStore()
  const { isEventCompleted } = useCalendarStore()
  const { completeEvent, uncompleteEvent } = useCompleteEvent()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const completed = isEventCompleted(event, tasks)
  const linkedTask = event.linkedTaskId ? tasks[event.linkedTaskId] : null

  const startTime = event.start.dateTime
    ? format(parseISO(event.start.dateTime), 'h:mm a')
    : 'All day'
  const endTime = event.end.dateTime
    ? format(parseISO(event.end.dateTime), 'h:mm a')
    : null

  async function handleToggleComplete() {
    setIsSubmitting(true)
    try {
      if (completed) {
        await uncompleteEvent(event)
      } else {
        await completeEvent(event)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="absolute z-20 bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-56 text-sm"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex justify-between items-start mb-1">
        <span className={`font-medium leading-snug flex-1 ${completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {event.summary}
        </span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-1 text-xs">✕</button>
      </div>
      <div className="text-xs text-slate-500 mb-1">
        {startTime}{endTime ? ` – ${endTime}` : ''}
      </div>
      {event.description && (
        <p className="text-xs text-slate-600 mb-2 line-clamp-3">
          {event.description.replace(/\[task-boxer:[^\]]+\]/, '').trim()}
        </p>
      )}
      {linkedTask && (
        <div className="text-xs text-slate-500 mb-2 flex items-center gap-1 border-t border-slate-100 pt-1.5">
          <span className="text-slate-400">Task:</span>
          <span className={`flex-1 truncate ${linkedTask.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-600'}`}>
            {linkedTask.title}
          </span>
          {linkedTask.status === 'completed' && (
            <svg className="w-3 h-3 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-100">
        <button
          onClick={handleToggleComplete}
          disabled={isSubmitting}
          className={`text-xs px-2 py-1 rounded font-medium flex-1 disabled:opacity-50 ${
            completed
              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          }`}
        >
          {completed ? 'Mark incomplete' : '✓ Mark done'}
        </button>
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0"
          >
            Open ↗
          </a>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: builds cleanly.

- [ ] **Step 3: Manual test**

Load extension in Chrome, open Calendar view, click a calendar event to open its popover. Verify "Mark done" button appears. Click it — event title should get strikethrough, button should change to "Mark incomplete".

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/EventPopover.tsx
git commit -m "feat: add mark done/incomplete and linked task info to EventPopover"
```

---

## Task 6: Event chip completion visuals (hover checkbox)

Add a hover checkbox + greyed-out completed state to event chips in DayCell, WeekView, and DayView.

**Files:**
- Modify: `src/components/calendar/DayCell.tsx`
- Modify: `src/components/calendar/WeekView.tsx`
- Modify: `src/components/calendar/DayView.tsx`

### DayCell.tsx

- [ ] **Step 1: Add imports and hook**

In `src/components/calendar/DayCell.tsx`, add to imports:

```ts
import { useCalendarStore } from '../../stores/calendar-store'
import { useCompleteEvent } from '../../hooks/useCompleteEvent'
```

Inside the component function, add after existing hooks:

```ts
  const { tasks } = useTasksStore()
  const { isEventCompleted } = useCalendarStore()
  const { completeEvent, uncompleteEvent } = useCompleteEvent()
```

- [ ] **Step 2: Replace event chip rendering**

Replace the event chip `<button>` (lines 68–75) with a `<div className="group">` containing a checkbox button and title button:

```tsx
          if (type === 'event') {
            const event = item as ExtendedCalendarEvent
            const isCompleted = isEventCompleted(event, tasks)
            return (
              <div
                key={`e-${event.id}`}
                className="group flex items-center w-full text-xs rounded overflow-hidden"
                style={{ backgroundColor: isCompleted ? '#e2e8f0' : getEventColour(event) }}
              >
                <button
                  onClick={async e => {
                    e.stopPropagation()
                    if (isCompleted) await uncompleteEvent(event)
                    else await completeEvent(event)
                  }}
                  className="opacity-0 group-hover:opacity-100 w-3.5 h-3.5 flex-shrink-0 rounded-sm border flex items-center justify-center ml-0.5 transition-opacity"
                  style={{ borderColor: isCompleted ? '#94a3b8' : 'rgba(255,255,255,0.6)' }}
                >
                  {isCompleted && (
                    <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setSelectedEvent(event) }}
                  className="flex-1 text-left px-1 py-0.5 truncate font-medium"
                  style={{ color: isCompleted ? '#94a3b8' : 'white' }}
                >
                  <span className={isCompleted ? 'line-through' : ''}>{event.summary}</span>
                </button>
              </div>
            )
```

### WeekView.tsx

- [ ] **Step 3: Add imports and hook**

In `src/components/calendar/WeekView.tsx`, add:

```ts
import { useCalendarStore } from '../../stores/calendar-store'
import { useCompleteEvent } from '../../hooks/useCompleteEvent'
```

Inside the component, add:
```ts
  const { tasks } = useTasksStore()
  const { isEventCompleted } = useCalendarStore()
  const { completeEvent, uncompleteEvent } = useCompleteEvent()
```

- [ ] **Step 4: Replace event chip in WeekView**

Replace the event `<div>` (lines 71–83) with:

```tsx
                {dayEvents.map(event => {
                  const isCompleted = isEventCompleted(event, tasks)
                  return (
                    <div
                      key={event.id}
                      className="group flex items-center gap-1 text-xs px-1 py-1 rounded font-medium"
                      style={{ backgroundColor: isCompleted ? '#e2e8f0' : getEventColour(event) }}
                    >
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          if (isCompleted) await uncompleteEvent(event)
                          else await completeEvent(event)
                        }}
                        className="opacity-0 group-hover:opacity-100 w-3.5 h-3.5 flex-shrink-0 rounded-sm border flex items-center justify-center transition-opacity"
                        style={{ borderColor: isCompleted ? '#94a3b8' : 'rgba(255,255,255,0.6)' }}
                      >
                        {isCompleted && (
                          <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                      {event.start.dateTime && (
                        <span className="opacity-80 flex-shrink-0" style={{ color: isCompleted ? '#94a3b8' : 'white' }}>
                          {format(new Date(event.start.dateTime), 'HH:mm')}
                        </span>
                      )}
                      <span
                        className={`truncate ${isCompleted ? 'line-through' : ''}`}
                        style={{ color: isCompleted ? '#94a3b8' : 'white' }}
                      >
                        {event.summary}
                      </span>
                    </div>
                  )
                })}
```

### DayView.tsx

- [ ] **Step 5: Add imports and hook**

In `src/components/calendar/DayView.tsx`, add:

```ts
import { useCalendarStore } from '../../stores/calendar-store'
import { useCompleteEvent } from '../../hooks/useCompleteEvent'
```

Inside the component, add:
```ts
  const { tasks } = useTasksStore()
  const { isEventCompleted } = useCalendarStore()
  const { completeEvent, uncompleteEvent } = useCompleteEvent()
```

- [ ] **Step 6: Replace event chip in DayView**

Replace the event `<div>` (lines 49–65) with:

```tsx
            {dayEvents.map(event => {
              const isCompleted = isEventCompleted(event, tasks)
              return (
                <div
                  key={event.id}
                  className="group flex items-center gap-2 text-sm px-3 py-2 rounded-md font-medium"
                  style={{
                    backgroundColor: isCompleted ? '#e2e8f0' : getEventColour(event),
                    opacity: isCompleted ? 0.75 : 1,
                  }}
                >
                  <button
                    onClick={async e => {
                      e.stopPropagation()
                      if (isCompleted) await uncompleteEvent(event)
                      else await completeEvent(event)
                    }}
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-opacity"
                    style={{ borderColor: isCompleted ? '#94a3b8' : 'rgba(255,255,255,0.6)' }}
                  >
                    {isCompleted && (
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                  {event.start.dateTime && (
                    <span className="text-xs flex-shrink-0" style={{ color: isCompleted ? '#94a3b8' : 'rgba(255,255,255,0.8)' }}>
                      {format(new Date(event.start.dateTime), 'HH:mm')}
                      {event.end.dateTime && ` – ${format(new Date(event.end.dateTime), 'HH:mm')}`}
                    </span>
                  )}
                  <span
                    className={`truncate ${isCompleted ? 'line-through' : ''}`}
                    style={{ color: isCompleted ? '#94a3b8' : 'white' }}
                  >
                    {event.summary}
                  </span>
                </div>
              )
            })}
```

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: builds cleanly.

- [ ] **Step 8: Commit**

```bash
git add src/components/calendar/DayCell.tsx src/components/calendar/WeekView.tsx src/components/calendar/DayView.tsx
git commit -m "feat: add hover checkbox and completed visual state to calendar event chips"
```

---

## Task 7: Settings panel

**Files:**
- Modify: `src/stores/ui-store.ts`
- Create: `src/components/settings/SettingsPanel.tsx`
- Modify: `src/components/layout/SideRail.tsx`
- Modify: `src/components/layout/Layout.tsx`

- [ ] **Step 1: Add showSettings to UI store**

In `src/stores/ui-store.ts`, add to the `UIStore` interface:

```ts
  // Settings panel
  showSettings: boolean
  toggleSettings: () => void
```

Add to the initial state:
```ts
  showSettings: false,
```

Add the action:
```ts
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
```

- [ ] **Step 2: Create SettingsPanel component**

Create `src/components/settings/SettingsPanel.tsx`:

```tsx
import { useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useCalendarStore } from '../../stores/calendar-store'
import { useUIStore } from '../../stores/ui-store'
import { calendarApi } from '../../services/api/calendar-api'

export default function SettingsPanel() {
  const { settings, patch } = useSettingsStore()
  const { calendars, syncCalendars } = useCalendarStore()
  const { toggleSettings } = useUIStore()
  const [isCreatingCalendar, setIsCreatingCalendar] = useState(false)
  const [calendarError, setCalendarError] = useState<string | null>(null)

  // If defaultSchedulingCalendarId is set AND exists in the calendars list, we already have Taskboxing set up
  const hasSchedulingCalendar = !!(
    settings.defaultSchedulingCalendarId &&
    calendars.some(c => c.id === settings.defaultSchedulingCalendarId)
  )

  async function handleCreateTaskboxing() {
    setIsCreatingCalendar(true)
    setCalendarError(null)
    try {
      const cal = await calendarApi.createCalendar({
        summary: 'Taskboxing',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      await patch({ defaultSchedulingCalendarId: cal.id })
      await syncCalendars()
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to create calendar')
    } finally {
      setIsCreatingCalendar(false)
    }
  }

  return (
    <div className="absolute inset-0 z-30 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-700">Settings</h2>
        <button
          onClick={toggleSettings}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">
        {/* Scheduling */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Scheduling</h3>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Default calendar</label>
              {calendars.length === 0 ? (
                <span className="text-xs text-slate-400 italic">Loading calendars…</span>
              ) : (
                <select
                  value={settings.defaultSchedulingCalendarId ?? ''}
                  onChange={e => patch({ defaultSchedulingCalendarId: e.target.value || undefined })}
                  className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">— Primary calendar —</option>
                  {calendars.map(cal => (
                    <option key={cal.id} value={cal.id}>{cal.summary}</option>
                  ))}
                </select>
              )}
            </div>

            {!hasSchedulingCalendar && (
              <div>
                {calendarError && (
                  <p className="text-xs text-red-500 mb-1">{calendarError}</p>
                )}
                <button
                  onClick={handleCreateTaskboxing}
                  disabled={isCreatingCalendar}
                  className="text-xs px-3 py-1.5 border border-dashed border-blue-300 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingCalendar ? 'Creating…' : '+ Create Taskboxing calendar'}
                </button>
              </div>
            )}

            {hasSchedulingCalendar && (
              <p className="text-xs text-green-600">
                ✓ Taskboxing calendar ready
              </p>
            )}
          </div>
        </div>

        {/* Tags placeholder */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Tags</h3>
          {settings.tags.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No tags yet. Add tags in the task editor.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {settings.tags.map(tag => (
                <span
                  key={tag.id}
                  style={{ backgroundColor: tag.colour + '20', color: tag.colour, borderColor: tag.colour }}
                  className="text-xs px-2 py-0.5 rounded-full border font-medium"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire up settings button in SideRail**

In `src/components/layout/SideRail.tsx`, add import:

```ts
import { useUIStore, type ActiveView } from '../../stores/ui-store'
```

(It already imports this — `useUIStore` is already there.) Inside the component, destructure `toggleSettings`:

```ts
  const { activeView, setActiveView, toggleSettings } = useUIStore()
```

Update the Settings button to call `toggleSettings`:

```tsx
      <button
        onClick={toggleSettings}
        className="mt-auto w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        title="Settings"
      >
        <SettingsIcon />
      </button>
```

- [ ] **Step 4: Render SettingsPanel in Layout**

In `src/components/layout/Layout.tsx`, add import:

```ts
import SettingsPanel from '../settings/SettingsPanel'
```

Add to destructure:
```ts
  const { activeView, syncError, setSyncError, showSettings } = useUIStore()
```

In the JSX, inside the content `<div className="flex flex-col flex-1 ...">`, add the SettingsPanel after the error banner and before the active view:

```tsx
        {/* Settings panel (overlays content area) */}
        {showSettings && (
          <div className="absolute inset-0 z-30">
            <SettingsPanel />
          </div>
        )}
```

The full `<div className="flex flex-col flex-1 min-w-0 overflow-hidden">` should look like:

```tsx
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        {/* Sync error banner */}
        {syncError && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
            <span className="flex-1">{syncError}</span>
            <button
              onClick={() => setSyncError(null)}
              className="text-red-500 hover:text-red-700 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Settings panel (overlays content area) */}
        {showSettings && (
          <div className="absolute inset-0 z-30">
            <SettingsPanel />
          </div>
        )}

        {/* Active view */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'list' && <ListView />}
          {activeView === 'calendar' && <CalendarView />}
          {activeView === 'timeline' && <PlaceholderView name="Timeline" />}
          {activeView === 'dashboard' && <PlaceholderView name="Dashboard" />}
        </div>
      </div>
```

Note: `relative` is added to the parent `<div>` so `absolute inset-0` on the SettingsPanel positions correctly.

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: builds cleanly.

- [ ] **Step 6: Manual test**

Load extension, click the gear icon in the rail. Settings panel should slide over the content area. Should show "Scheduling" section with a calendar dropdown and "Create Taskboxing calendar" button. Clicking ✕ should dismiss it.

- [ ] **Step 7: Commit**

```bash
git add src/stores/ui-store.ts src/components/settings/SettingsPanel.tsx src/components/layout/SideRail.tsx src/components/layout/Layout.tsx
git commit -m "feat: add settings panel with scheduling calendar section"
```

---

## Task 8: DayPreview + ScheduleForm components

**Files:**
- Create: `src/components/tasks/DayPreview.tsx`
- Create: `src/components/tasks/ScheduleForm.tsx`

- [ ] **Step 1: Create DayPreview**

Create `src/components/tasks/DayPreview.tsx`:

```tsx
import { useMemo } from 'react'
import { format } from 'date-fns'
import { useCalendarStore } from '../../stores/calendar-store'

interface Props {
  date: string             // YYYY-MM-DD
  excludeEventId?: string  // skip this event (being rescheduled)
}

export default function DayPreview({ date, excludeEventId }: Props) {
  const { events, calendars } = useCalendarStore()

  const dayEvents = useMemo(() => {
    return Object.values(events)
      .filter(e => {
        if (e.id === excludeEventId) return false
        const d = e.start.date ?? e.start.dateTime?.slice(0, 10)
        return d === date
      })
      .sort((a, b) => {
        const aT = a.start.dateTime ?? a.start.date ?? ''
        const bT = b.start.dateTime ?? b.start.date ?? ''
        return aT.localeCompare(bT)
      })
  }, [date, events, excludeEventId])

  if (dayEvents.length === 0) {
    return <p className="text-xs text-slate-400 italic">No events on this day</p>
  }

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <p className="text-xs text-slate-400 px-2 py-1 bg-slate-50 border-b border-slate-100 font-medium">
        {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''} on this day
      </p>
      <div className="max-h-28 overflow-y-auto divide-y divide-slate-50">
        {dayEvents.map(event => {
          const cal = calendars.find(c => c.id === event.calendarId)
          const colour = cal?.backgroundColor ?? '#6366f1'
          const timeStr = event.start.dateTime
            ? format(new Date(event.start.dateTime), 'HH:mm')
            : 'All day'
          const endStr = event.end.dateTime
            ? format(new Date(event.end.dateTime), 'HH:mm')
            : null
          return (
            <div key={event.id} className="flex items-center gap-1.5 px-2 py-1">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colour }} />
              <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">
                {timeStr}{endStr ? `–${endStr}` : ''}
              </span>
              <span className="text-xs text-slate-700 truncate">{event.summary}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ScheduleForm**

Create `src/components/tasks/ScheduleForm.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import type { ExtendedTask, ExtendedCalendarEvent, CalendarEventTime } from '../../types/task.types'
import { useCalendarStore } from '../../stores/calendar-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useTasksStore } from '../../stores/tasks-store'
import DayPreview from './DayPreview'

interface Props {
  task: ExtendedTask
  existingEvent?: ExtendedCalendarEvent | null  // null/undefined = new schedule
  onScheduled: () => void
  onCancel: () => void
}

export default function ScheduleForm({ task, existingEvent, onScheduled, onCancel }: Props) {
  const { calendars, createTaskEvent, addEvent } = useCalendarStore()
  const { settings } = useSettingsStore()
  const { updateTask } = useTasksStore()
  const { patchEvent } = useCalendarStore()

  // Resolve default calendar: user setting → primary calendar → first calendar
  const primaryCalendar = calendars.find(c => c.primary)
  const defaultCalId =
    settings.defaultSchedulingCalendarId ??
    primaryCalendar?.id ??
    calendars[0]?.id ??
    ''

  // Initialise from existing event or task defaults
  const initCalId = existingEvent?.calendarId ?? defaultCalId
  const initDate = existingEvent?.start.dateTime
    ? existingEvent.start.dateTime.slice(0, 10)
    : task.due?.slice(0, 10) ?? format(new Date(), 'yyyy-MM-dd')
  const initStart = existingEvent?.start.dateTime
    ? format(new Date(existingEvent.start.dateTime), 'HH:mm')
    : ''
  const initEnd = existingEvent?.end.dateTime
    ? format(new Date(existingEvent.end.dateTime), 'HH:mm')
    : ''

  const [calendarId, setCalendarId] = useState(initCalId)
  const [date, setDate] = useState(initDate)
  const [startTime, setStartTime] = useState(initStart)
  const [endTime, setEndTime] = useState(initEnd)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-compute end time when start changes (new events only, and only once)
  useEffect(() => {
    if (!existingEvent && startTime && !endTime) {
      const [h, m] = startTime.split(':').map(Number)
      const totalMins = h * 60 + m + (task.metadata.estimatedMinutes ?? 60)
      const eh = Math.floor(totalMins / 60) % 24
      const em = totalMins % 60
      setEndTime(`${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`)
    }
  }, [startTime]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update default calendar when calendars load
  useEffect(() => {
    if (!calendarId && calendars.length > 0) {
      setCalendarId(
        settings.defaultSchedulingCalendarId ??
        calendars.find(c => c.primary)?.id ??
        calendars[0].id
      )
    }
  }, [calendars]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!startTime) return
    setIsSaving(true)
    setError(null)
    try {
      const start: CalendarEventTime = {
        dateTime: new Date(`${date}T${startTime}:00`).toISOString(),
      }
      const end: CalendarEventTime = {
        dateTime: new Date(`${date}T${(endTime || startTime)}:00`).toISOString(),
      }

      let savedEvent: ExtendedCalendarEvent

      if (existingEvent) {
        if (calendarId !== existingEvent.calendarId) {
          // Calendar changed: delete old, create new linked event
          const { deleteEvent } = useCalendarStore.getState()
          await deleteEvent(existingEvent.calendarId, existingEvent.id)
          savedEvent = await createTaskEvent(calendarId, task.id, task.taskListId, task.title, start, end)
        } else {
          // Same calendar: patch start/end only
          const { patchEvent: patchApi } = await import('../../services/api/calendar-api').then(m => ({ patchEvent: m.calendarApi.patchEvent.bind(m.calendarApi) }))
          const patched = await patchApi(calendarId, existingEvent.id, { start, end })
          await addEvent(patched)
          savedEvent = patched
        }
      } else {
        savedEvent = await createTaskEvent(calendarId, task.id, task.taskListId, task.title, start, end)
      }

      // Save calendarEventId + calendarId into task metadata
      await updateTask({
        ...task,
        metadata: {
          ...task.metadata,
          calendarEventId: savedEvent.id,
          calendarId: savedEvent.calendarId,
        },
      })

      onScheduled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {/* Form row */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <select
          value={calendarId}
          onChange={e => setCalendarId(e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-full"
        >
          {calendars.map(cal => (
            <option key={cal.id} value={cal.id}>{cal.summary}</option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <input
          type="time"
          value={startTime}
          onChange={e => setStartTime(e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <span className="text-xs text-slate-400">→</span>
        <input
          type="time"
          value={endTime}
          onChange={e => setEndTime(e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={handleSubmit}
          disabled={!startTime || isSaving}
          className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? '…' : existingEvent ? 'Update' : 'Schedule'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Day preview */}
      {date && (
        <DayPreview date={date} excludeEventId={existingEvent?.id} />
      )}
    </div>
  )
}
```

> **Note:** The `patchEvent` call above uses a dynamic import to avoid circular dependency issues. If the build fails on this, simplify: import `calendarApi` directly at the top of the file and call `calendarApi.patchEvent(calendarId, existingEvent.id, { start, end })`, then call `addEvent(patched)` separately.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: builds cleanly. Fix any TypeScript errors (the dynamic import pattern may need adjustment — see note above).

**Common fix:** Replace the dynamic import block for patchEvent with a direct import:

At the top of the file add:
```ts
import { calendarApi } from '../../services/api/calendar-api'
```

And in the reschedule same-calendar branch:
```ts
          const patched = await calendarApi.patchEvent(calendarId, existingEvent.id, { start, end })
          await addEvent(patched)
          savedEvent = patched
```

Also remove `patchEvent` from the `useCalendarStore` destructure in the component since it's not needed.

- [ ] **Step 4: Commit**

```bash
git add src/components/tasks/DayPreview.tsx src/components/tasks/ScheduleForm.tsx
git commit -m "feat: add DayPreview and ScheduleForm components"
```

---

## Task 9: Wire TaskEditorForm calendar section

**Files:**
- Modify: `src/components/tasks/TaskEditorForm.tsx:1-10` (imports)
- Modify: `src/components/tasks/TaskEditorForm.tsx:44-50` (state)
- Modify: `src/components/tasks/TaskEditorForm.tsx:328-345` (Calendar section)

- [ ] **Step 1: Add imports**

In `src/components/tasks/TaskEditorForm.tsx`, add to imports:

```ts
import ScheduleForm from './ScheduleForm'
```

Also ensure `useCalendarStore` is imported (it may already be there via LinkedEventInfo):
```ts
import { useCalendarStore } from '../../stores/calendar-store'
```

- [ ] **Step 2: Add showScheduleForm state**

Inside the `TaskEditorForm` component function, after the existing `useState` calls, add:

```ts
  const [showScheduleForm, setShowScheduleForm] = useState(false)
```

Also read the linked event from the calendar store (needed for Reschedule pre-population):

```ts
  const { events } = useCalendarStore()
  const linkedEvent = existingTask?.metadata.calendarEventId
    ? events[existingTask.metadata.calendarEventId] ?? null
    : null
```

- [ ] **Step 3: Replace the Calendar section**

Find and replace the entire `{/* Linked calendar event */}` section (lines 328–345):

```tsx
        {/* Linked calendar event */}
        {existingTask && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Calendar</label>
            {existingTask.metadata.calendarEventId && !showScheduleForm ? (
              <div className="flex flex-col gap-1.5">
                <LinkedEventInfo
                  eventId={existingTask.metadata.calendarEventId}
                  calendarId={existingTask.metadata.calendarId}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowScheduleForm(true)}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={async () => {
                      if (!existingTask.metadata.calendarEventId || !existingTask.metadata.calendarId) return
                      try {
                        const { deleteEvent } = useCalendarStore.getState()
                        await deleteEvent(existingTask.metadata.calendarId, existingTask.metadata.calendarEventId)
                        await updateTask({
                          ...existingTask,
                          metadata: { ...existingTask.metadata, calendarEventId: undefined, calendarId: undefined },
                        })
                      } catch (err) {
                        console.error('Failed to unschedule:', err)
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Unschedule
                  </button>
                </div>
              </div>
            ) : showScheduleForm ? (
              <ScheduleForm
                task={existingTask}
                existingEvent={linkedEvent}
                onScheduled={() => setShowScheduleForm(false)}
                onCancel={() => setShowScheduleForm(false)}
              />
            ) : (
              <button
                onClick={() => setShowScheduleForm(true)}
                className="text-xs text-slate-600 border border-dashed border-slate-300 rounded-md px-3 py-1.5 hover:border-blue-400 hover:text-blue-600"
              >
                Schedule on calendar
              </button>
            )}
          </div>
        )}
```

> **Note:** `useCalendarStore.getState()` is used in the inline `onClick` handlers to avoid stale closure issues. This is the Zustand pattern for accessing store state in non-reactive contexts. If the linter flags this, extract the delete logic into a named async function above the return.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: builds cleanly.

**If `useCalendarStore.getState()` causes linter errors**, refactor the unschedule handler to a named function:

```ts
  async function handleUnschedule() {
    if (!existingTask?.metadata.calendarEventId || !existingTask.metadata.calendarId) return
    try {
      const calStore = useCalendarStore.getState()
      await calStore.deleteEvent(existingTask.metadata.calendarId, existingTask.metadata.calendarEventId)
      await updateTask({
        ...existingTask,
        metadata: { ...existingTask.metadata, calendarEventId: undefined, calendarId: undefined },
      })
    } catch (err) {
      console.error('Failed to unschedule:', err)
    }
  }
```

And in the JSX: `onClick={handleUnschedule}`.

- [ ] **Step 5: Manual test**

1. Open the extension, navigate to List view
2. Open any existing task in the task editor modal
3. Scroll to "Calendar" section — should show "Schedule on calendar" button (enabled)
4. Click it — ScheduleForm should expand inline with calendar dropdown, date, start/end time inputs, and DayPreview
5. Pick a date → DayPreview shows events for that day
6. Fill in start time → end time auto-calculates
7. Click "Schedule" → task modal should show the linked event info with Reschedule/Unschedule buttons
8. Click "Reschedule" → ScheduleForm opens pre-filled with existing event time
9. Click "Unschedule" → event info disappears, "Schedule on calendar" button returns

- [ ] **Step 6: Commit**

```bash
git add src/components/tasks/TaskEditorForm.tsx
git commit -m "feat: enable manual scheduling in task editor with ScheduleForm integration"
```

---

## Final verification

- [ ] Run full build one more time:

```bash
npm run build
```

Expected: clean build, no errors or warnings.

- [ ] Load extension in Chrome and test the complete flow:
  1. Settings gear → Scheduling section → "Create Taskboxing calendar" (creates a new Google Calendar named "Taskboxing", sets as default)
  2. Open a task editor → Calendar section → Schedule on calendar → pick date/time → Schedule → event appears in Google Calendar
  3. Navigate to Calendar view → event appears with correct color
  4. Hover over event chip → checkbox appears on left edge
  5. Click checkbox → event goes grey + strikethrough
  6. Click event to open popover → "Mark incomplete" button visible → click it → event un-greys
  7. Complete the linked task → switch to Calendar view → linked event should also show as completed
