# Design: Scheduling in New Task Modal + Default Task List Setting

**Date:** 2026-03-19
**Status:** Approved

---

## Overview

Two related UX improvements to the task creation flow:

1. **Scheduling in New Task modal** — expose the same Calendar section (ScheduleForm) in new task creation that currently only appears in edit mode. The task is created first on Save, then its real ID is used to create the calendar event.
2. **Default task list in Settings** — surface the existing `defaultTaskListId` AppSettings field in the SettingsPanel UI, and use it as a fallback when pre-selecting the list in the new task form.

---

## Feature 1: Scheduling in New Task Modal

### Problem

`ScheduleForm` is currently guarded by `{existingTask && ...}`, making it inaccessible when creating a new task. The core technical blocker is that `ScheduleForm.submit()` needs a real `task.id` to link the calendar event, which doesn't exist until after `createTask` returns.

### Solution

**Three targeted changes, no new files.**

#### 1. `tasks-store.ts` — `createTask` returns `ExtendedTask`

Change the return type of `createTask` from `void` to `Promise<ExtendedTask>` so the caller can capture the newly created task (including its real `id` and `taskListId`).

#### 2. `ScheduleForm.tsx` — `submit()` accepts an optional task override

```ts
export interface ScheduleFormHandle {
  submit: (taskOverride?: Pick<ExtendedTask, 'id' | 'taskListId'>) => Promise<void>
}
```

Inside `handleSubmit`, resolve the task identifiers as `taskOverride ?? task`. This allows `TaskEditorForm` to pass the real task after creation while the form's display still initialises from the synthetic task passed as a prop.

#### 3. `TaskEditorForm.tsx` — Calendar section for new tasks

- Remove the `{existingTask && ...}` guard around the Calendar section.
- For new tasks, construct a synthetic partial `ExtendedTask` from current form state (title, due date, estimatedMinutes) to pass to `ScheduleForm` for display/initialisation. This gives the form correct date and duration defaults.
- For new tasks, only the "Schedule on calendar" button is shown (no `LinkedEventInfo`, no Reschedule/Unschedule — these require an existing saved task).
- In `handleSave` for new tasks with scheduling enabled:
  1. `const newTask = await createTask(...)` — capture return value
  2. `await scheduleFormRef.current.submit(newTask)` — pass real IDs

### Data flow (new task + schedule)

```
User fills form → clicks Save
  → createTask(selectedListId, ...) → returns ExtendedTask (with real id)
  → scheduleFormRef.current.submit({ id: newTask.id, taskListId: newTask.taskListId })
      → createTaskEvent(calendarId, newTask.id, newTask.taskListId, ...)
      → updateTask({ ...newTask, metadata: { calendarEventId, calendarId } })
  → onClose()
```

---

## Feature 2: Default Task List Setting

### Problem

`AppSettings.defaultTaskListId` exists in the data model but is not exposed in the SettingsPanel UI. The new task form falls back to `taskLists[0]` when no specific list is active in the view.

### Solution

#### 1. `SettingsPanel.tsx` — Default task list dropdown

- Pull `taskLists` from `useTasksStore`.
- Add a "Default task list" section with a `<select>` bound to `settings.defaultTaskListId`.
- On change: `chromeStorage.patchSettings({ defaultTaskListId })` (same pattern as the existing scheduling calendar selector).

#### 2. `TaskEditorForm.tsx` — Updated default list priority

```
existingTask?.taskListId       // edit mode — always use task's own list
?? activeTaskListFilter        // a specific list is active in the view
?? settings.defaultTaskListId  // user's preferred default for new tasks
?? taskLists[0]?.id            // last resort
```

The ListView filter (`activeTaskListFilter`) is unchanged — it still defaults to `null` (All lists).

---

## Files Changed

| File | Change |
|------|--------|
| `src/stores/tasks-store.ts` | `createTask` returns `ExtendedTask` |
| `src/components/tasks/ScheduleForm.tsx` | `submit()` accepts optional `taskOverride` |
| `src/components/tasks/TaskEditorForm.tsx` | Calendar section shown for new tasks; updated default list priority; capture `createTask` return value |
| `src/components/settings/SettingsPanel.tsx` | Default task list dropdown |

No new files. No schema changes.
