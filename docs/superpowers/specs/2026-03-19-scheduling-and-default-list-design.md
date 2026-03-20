# Design: Scheduling in New Task Modal + Default Task List Setting

**Date:** 2026-03-19
**Status:** Approved

---

## Future: Native Google Tasks Scheduling

As of 2026-03-20, Google Tasks has introduced start and finish times in its UI, but these fields are **not yet exposed in the Google Tasks API**. Once they are:

- Replace the calendar-event creation approach with direct task updates using the native time fields.
- Remove `metadata.calendarEventId` and `metadata.calendarId` from the task metadata schema.
- Retain the option to create a corresponding Google Calendar event when the user explicitly wants it — for example, to set reminders or share the event with others.

Until the API exposes these fields, the calendar-event approach documented below remains the intended implementation.

---

## Overview

Two UX improvements to the task creation flow:

1. **Scheduling in New Task modal** — expose the same Calendar section (ScheduleForm) in new task creation that currently only appears in edit mode.
2. **Default task list in Settings** — surface the existing `AppSettings.defaultTaskListId` field in the SettingsPanel UI, and use it as a fallback when pre-selecting the list in the new task form.

---

## Feature 1: Scheduling in New Task Modal

### Problem

`ScheduleForm` is guarded by `{existingTask && ...}`, making it inaccessible during task creation. The blocker: `ScheduleForm.submit()` needs a real `task.id`, which doesn't exist until `createTask` returns. (`createTask` in tasks-store already returns `Promise<ExtendedTask>` — no store change needed.)

### Changes to `ScheduleForm.tsx`

#### Step 1 — Export `ScheduleTaskInit`

Add and export a minimal interface covering the fields `ScheduleForm` reads from `task` at mount time (for display/init only):

```ts
export interface ScheduleTaskInit {
  title: string
  due?: string
  metadata: { estimatedMinutes?: number }
}
```

#### Step 2 — Widen `Props.task` type

Change the `task` prop from `ExtendedTask` to `ExtendedTask | ScheduleTaskInit`:

```ts
interface Props {
  task: ExtendedTask | ScheduleTaskInit   // was: task: ExtendedTask
  existingEvent?: ExtendedCalendarEvent | null
  onCancel: () => void
}
```

The init code that reads `task.due` and `task.metadata.estimatedMinutes` continues to work — both fields are present in `ScheduleTaskInit`. No changes needed to the init logic.

#### Step 3 — Update `ScheduleFormHandle.submit`

```ts
export interface ScheduleFormHandle {
  submit: (taskOverride?: ExtendedTask) => Promise<void>
}
```

#### Step 4 — Update `handleSubmit` to use `taskForApi`

Replace every use of `task.id`, `task.taskListId`, and the `...task` spread with a resolved `taskForApi`. Add a runtime guard to catch any misuse where `task` is `ScheduleTaskInit` but no `taskOverride` was provided (this cannot happen in the intended flows, but the guard makes it safe):

```ts
async function handleSubmit(taskOverride?: ExtendedTask) {
  // taskForApi is used for ALL API calls — createTaskEvent and updateTask.
  // In new-task flow, taskOverride is always the real ExtendedTask returned by createTask.
  // In edit-mode flow, taskOverride is undefined and task is the real ExtendedTask prop.
  const taskForApi = taskOverride ?? (task as ExtendedTask)

  // Runtime guard: ScheduleTaskInit has no 'id'. If somehow called without a real task, bail out.
  if (!('id' in taskForApi)) {
    setError('Cannot schedule: task must be saved first')
    return
  }

  if (!startTime) return
  setIsSaving(true)
  setError(null)
  try {
    // ... existing time resolution logic (resolvedEnd, start, end) unchanged ...

    let savedEvent: ExtendedCalendarEvent

    if (existingEvent) {
      if (calendarId !== existingEvent.calendarId) {
        savedEvent = await createTaskEvent(calendarId, taskForApi.id, taskForApi.taskListId, taskForApi.title, start, end)
        await deleteEvent(existingEvent.calendarId, existingEvent.id)
      } else {
        const patched = await calendarApi.patchEvent(calendarId, existingEvent.id, { start, end })
        await addEvent(patched)
        savedEvent = patched
      }
    } else {
      savedEvent = await createTaskEvent(calendarId, taskForApi.id, taskForApi.taskListId, taskForApi.title, start, end)
    }

    await updateTask({
      ...taskForApi,
      metadata: {
        ...taskForApi.metadata,
        calendarEventId: savedEvent.id,
        calendarId: savedEvent.calendarId,
      },
    })
  } catch (err) {
    // ... existing error handling unchanged ...
  } finally {
    setIsSaving(false)
  }
}
```

#### Step 5 — `useImperativeHandle` (no line change, signature updates automatically)

```ts
useImperativeHandle(ref, () => ({ submit: handleSubmit }))
```

`handleSubmit` now accepts `taskOverride?: ExtendedTask`, so the exposed handle automatically satisfies the updated `ScheduleFormHandle` interface.

**Edit-mode backward-compatibility:** All existing `submit()` call sites pass no argument → `taskOverride` is `undefined` → `taskForApi = task as ExtendedTask` (the real `ExtendedTask` prop in edit mode). No change to edit-mode behavior.

**Note on the `existingEvent` branch:** For new tasks, `existingEvent` is always `undefined` (a brand-new task cannot have a linked calendar event), so the `if (existingEvent)` branch never runs in the new-task path. The blanket `taskForApi` substitution covers all branches for correctness.

---

### Changes to `TaskEditorForm.tsx`

#### Step 1 — Update import

```ts
import ScheduleForm, { type ScheduleFormHandle, type ScheduleTaskInit } from './ScheduleForm'
```

#### Step 2 — Remove the `existingTask` guard from the Calendar section

Before:
```tsx
{existingTask && (
  <div>
    <label ...>Calendar</label>
    {/* ... calendar section content ... */}
  </div>
)}
```

After: remove the outer `existingTask &&` guard. The content inside conditionally renders based on `existingTask` and `showScheduleForm` as before, with an added new-task path (see Step 3).

#### Step 3 — New-task Calendar section content

For new tasks (no `existingTask`), show only the "Schedule on calendar" button or the `ScheduleForm`. Full updated Calendar section:

```tsx
<div>
  <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Calendar</label>
  {existingTask ? (
    // existing edit-mode content unchanged:
    existingTask.metadata.calendarEventId && !showScheduleForm ? (
      <div className="flex flex-col gap-1.5">
        <LinkedEventInfo ... />
        <div className="flex gap-2">
          <button onClick={() => setShowScheduleForm(true)}>Reschedule</button>
          <button onClick={handleUnschedule}>Unschedule</button>
        </div>
      </div>
    ) : showScheduleForm ? (
      <ScheduleForm
        ref={scheduleFormRef}
        task={existingTask}
        existingEvent={linkedEvent}
        onCancel={() => setShowScheduleForm(false)}
      />
    ) : (
      <button onClick={() => setShowScheduleForm(true)}>Schedule on calendar</button>
    )
  ) : (
    // new-task path:
    showScheduleForm ? (
      <ScheduleForm
        ref={scheduleFormRef}
        task={{
          title: title.trim() || 'New Task',
          due: due || undefined,
          metadata: { estimatedMinutes: hasEstimate ? estimatedMinutes : undefined },
        }}
        existingEvent={undefined}
        onCancel={() => setShowScheduleForm(false)}
      />
    ) : (
      <button
        onClick={() => setShowScheduleForm(true)}
        className="text-xs text-slate-600 border border-dashed border-slate-300 rounded-md px-3 py-1.5 hover:border-blue-400 hover:text-blue-600"
      >
        Schedule on calendar
      </button>
    )
  )}
</div>
```

`ScheduleForm` is only mounted when `showScheduleForm` is `true` (conditional render), so init values are always fresh when the user opens the schedule form.

#### Step 4 — Update `handleSave` scheduling calls

The current outer `if (showScheduleForm && scheduleFormRef.current)` block (which runs after the `if (existingTask) / else` branches) must be **removed**. Scheduling is moved inside each branch:

```ts
if (existingTask) {
  await updateTask(updated)
  // edit mode: task prop is real ExtendedTask, no override needed
  if (showScheduleForm && scheduleFormRef.current) {
    await scheduleFormRef.current.submit()
  }
} else {
  const newTask = await createTask(selectedListId, title.trim(), userNotes, metaPatch, dueIso)
  // new task: pass the real ExtendedTask so ScheduleForm has a valid id/taskListId
  if (showScheduleForm && scheduleFormRef.current) {
    await scheduleFormRef.current.submit(newTask)
  }
}
onClose()
```

Moving scheduling inside the branches prevents double-submission and makes the `newTask` return value naturally scoped to where it's needed.

**Error handling:**
- If `createTask` rejects: `catch` fires, `submit()` is never called, modal stays open.
- If `submit()` rejects: `ScheduleForm` shows its own inline error, modal stays open (matches edit-mode behavior).

---

## Feature 2: Default Task List Setting

### Context

`AppSettings.defaultTaskListId?: string` already exists in the type definition — no schema change needed. It is just not surfaced in the UI yet.

### Changes to `SettingsPanel.tsx`

Add `import { useTasksStore } from '../../stores/tasks-store'` (new import).

Pull `taskLists` from `useTasksStore` and `patch` from `useSettingsStore`.

Add a "Default task list" dropdown in the existing Scheduling section:

```tsx
<div>
  <label className="block text-xs text-slate-500 mb-1">Default task list for new tasks</label>
  <select
    value={settings.defaultTaskListId ?? ''}
    onChange={e => patch({ defaultTaskListId: e.target.value || undefined })}
    disabled={taskLists.length === 0}
    className="..."
  >
    {taskLists.length === 0
      ? <option value="">Loading…</option>
      : taskLists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)
    }
  </select>
</div>
```

Use `patch({ defaultTaskListId })` via the settings store — not `chromeStorage.patchSettings()` directly — to keep in-memory store state in sync.

### Changes to `TaskEditorForm.tsx` — Updated default list priority

```ts
const validListIds = new Set(taskLists.map(l => l.id))
const defaultListId =
  existingTask?.taskListId                                                            // edit mode
  ?? activeTaskListFilter                                                              // specific list active in view (null = All → skipped by ??)
  ?? (settings.defaultTaskListId && validListIds.has(settings.defaultTaskListId)
      ? settings.defaultTaskListId : undefined)                                        // user default (validated against current lists)
  ?? taskLists[0]?.id                                                                  // last resort
```

**Priority rationale:** `activeTaskListFilter` wins over `defaultTaskListId` because if the user is viewing a specific list, new tasks most naturally belong there (contextual default). When "All lists" is selected, `activeTaskListFilter` is `null` and the `??` operator falls through to `defaultTaskListId`.

**Stale ID handling:** Validating `defaultTaskListId` against `taskLists` prevents a deleted list's stale ID from reaching the Google Tasks API.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/tasks/ScheduleForm.tsx` | Export `ScheduleTaskInit`; widen `Props.task` to `ExtendedTask \| ScheduleTaskInit`; update `ScheduleFormHandle.submit` signature; replace all `task.*` in `handleSubmit` with `taskForApi` |
| `src/components/tasks/TaskEditorForm.tsx` | Import `ScheduleTaskInit`; remove `existingTask &&` guard from Calendar section; add new-task calendar UI; update `handleSave` to capture `createTask` return and pass to `submit()`; update default list priority |
| `src/components/settings/SettingsPanel.tsx` | Add `useTasksStore` import; add default task list dropdown in Scheduling section |

No new files. No schema changes. No store changes.
