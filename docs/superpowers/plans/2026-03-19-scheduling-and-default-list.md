# Scheduling in New Task Modal + Default Task List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the ScheduleForm calendar section when creating new tasks, and add a "Default task list" setting to SettingsPanel that pre-selects the list in the new task form.

**Architecture:** Three file changes — `ScheduleForm.tsx` gets a wider prop type and an override parameter on `submit()`; `TaskEditorForm.tsx` exposes the Calendar section for new tasks and captures the task ID returned by `createTask`; `SettingsPanel.tsx` adds a dropdown bound to the already-existing `defaultTaskListId` settings field.

**Tech Stack:** React 19, TypeScript, Zustand, TailwindCSS, Vite. No test framework — verification is TypeScript type checking (`npx tsc --noEmit`) and a manual build (`npm run build`).

**Spec:** `docs/superpowers/specs/2026-03-19-scheduling-and-default-list-design.md`

---

## File Map

| File | What changes |
|------|-------------|
| `src/components/tasks/ScheduleForm.tsx` | Export `ScheduleTaskInit`; widen `Props.task`; update `submit()` signature; replace all `task.*` in `handleSubmit` with `taskForApi` |
| `src/components/tasks/TaskEditorForm.tsx` | Import `ScheduleTaskInit`; remove `existingTask &&` guard from Calendar section; add new-task calendar UI; move scheduling inside `if/else` branches; update default list priority |
| `src/components/settings/SettingsPanel.tsx` | Add `useTasksStore` import; add Default task list dropdown in Scheduling section |

---

## Task 1: Update ScheduleForm — widen prop type and submit override

**Files:**
- Modify: `src/components/tasks/ScheduleForm.tsx`

### Background

`ScheduleForm` currently takes `task: ExtendedTask` and its `handleSubmit` reads `task.id`, `task.taskListId`, `task.title` directly. To render it for a new task (which has no ID yet), we need to:
1. Widen the `task` prop to accept a minimal init-only shape (`ScheduleTaskInit`)
2. Add a `taskOverride?: ExtendedTask` parameter to `submit()` so the caller can pass the real task IDs after `createTask` resolves

Current `handleSubmit` signature: `async function handleSubmit()` — no parameters.
Current `ScheduleFormHandle`: `{ submit: () => Promise<void> }`

- [ ] **Step 1.1 — Add and export the `ScheduleTaskInit` interface**

Open `src/components/tasks/ScheduleForm.tsx`. After the existing imports (around line 8), add:

```ts
export interface ScheduleTaskInit {
  title: string
  due?: string
  metadata: { estimatedMinutes?: number }
}
```

- [ ] **Step 1.2 — Widen `Props.task` and update `ScheduleFormHandle`**

Find the `interface Props` block (around line 10) and the `ScheduleFormHandle` interface (around line 16). Change them to:

```ts
interface Props {
  task: ExtendedTask | ScheduleTaskInit   // was: task: ExtendedTask
  existingEvent?: ExtendedCalendarEvent | null
  onCancel: () => void
}

export interface ScheduleFormHandle {
  submit: (taskOverride?: ExtendedTask) => Promise<void>  // was: submit: () => Promise<void>
}
```

- [ ] **Step 1.3 — Update `handleSubmit` to use `taskForApi`**

Find `async function handleSubmit()` (around line 84). Update the signature and add the `taskForApi` resolution + runtime guard at the top of the function body, before the `if (!startTime) return` line:

```ts
async function handleSubmit(taskOverride?: ExtendedTask) {
  const taskForApi = taskOverride ?? (task as ExtendedTask)

  // Guard: ScheduleTaskInit has no 'id'. Bail if called without a real task.
  if (!('id' in taskForApi)) {
    setError('Cannot schedule: task must be saved first')
    return
  }

  if (!startTime) return
  // ... rest of function unchanged until the API calls ...
```

- [ ] **Step 1.4 — Replace all `task.` API call references with `taskForApi.`**

In the same `handleSubmit` function, find the two `createTaskEvent` calls and the `updateTask` call. Replace every occurrence of `task.id`, `task.taskListId`, `task.title`, and `...task` spread with the `taskForApi` equivalent:

Line ~108 (existingEvent + calendar-change branch):
```ts
savedEvent = await createTaskEvent(calendarId, taskForApi.id, taskForApi.taskListId, taskForApi.title, start, end)
```

Line ~118 (new event branch):
```ts
savedEvent = await createTaskEvent(calendarId, taskForApi.id, taskForApi.taskListId, taskForApi.title, start, end)
```

Lines ~122–129 (`updateTask`):
```ts
await updateTask({
  ...taskForApi,
  metadata: {
    ...taskForApi.metadata,
    calendarEventId: savedEvent.id,
    calendarId: savedEvent.calendarId,
  },
})
```

The `useImperativeHandle` line (`useImperativeHandle(ref, () => ({ submit: handleSubmit }))`) does **not** change — `handleSubmit` now accepts the parameter, so the handle exposes the updated signature automatically.

- [ ] **Step 1.5 — Type-check**

```bash
cd /Users/daimyo/Documents/Programming/Projects/Task-Boxer && npx tsc --noEmit
```

Expected: no errors. If TypeScript complains about `task.due` or `task.metadata.estimatedMinutes` being potentially absent — they are both present in `ScheduleTaskInit`, so this shouldn't happen. If it does, the issue is in the init code at the top of the component (lines ~37–51); those reads are safe because both fields exist in both union members.

- [ ] **Step 1.6 — Commit**

```bash
git add src/components/tasks/ScheduleForm.tsx
git commit -m "feat: widen ScheduleForm task prop and add submit override for new-task flow"
```

---

## Task 2: Update TaskEditorForm — Calendar section for new tasks + handleSave refactor

**Files:**
- Modify: `src/components/tasks/TaskEditorForm.tsx`

### Background

Two things happen in this file:

**Feature 1** — The Calendar section (lines ~340–380) is wrapped in `{existingTask && (...)}`. We remove that outer guard, and add a new-task branch that shows a "Schedule on calendar" button (or `ScheduleForm` when `showScheduleForm` is true). The `handleSave` function (line ~118) currently calls scheduling **outside** the `if/else` branches — we move it inside each branch so `newTask` is in scope for the new-task path.

**Feature 2** — The `defaultListId` constant (lines ~102–106) needs to include `settings.defaultTaskListId` as a fallback.

- [ ] **Step 2.1 — Update the `ScheduleForm` import to include `ScheduleTaskInit`**

Find the import at line 11:
```ts
import ScheduleForm, { type ScheduleFormHandle } from './ScheduleForm'
```

Change to:
```ts
import ScheduleForm, { type ScheduleFormHandle, type ScheduleTaskInit } from './ScheduleForm'
```

(The `type ScheduleTaskInit` import is used only as a type annotation — it can be omitted if you prefer to let TypeScript infer the inline object shape, but the explicit import is cleaner.)

- [ ] **Step 2.2 — Update the default list priority chain**

Find the block at lines ~101–106:
```ts
// For new tasks: which list to create in (user-selectable)
const defaultListId = existingTask?.taskListId
  ?? activeTaskListFilter
  ?? taskLists[0]?.id
  ?? ''
```

Replace with:
```ts
// For new tasks: which list to create in (user-selectable)
const validListIds = new Set(taskLists.map(l => l.id))
const defaultListId =
  existingTask?.taskListId
  ?? activeTaskListFilter
  ?? (settings.defaultTaskListId && validListIds.has(settings.defaultTaskListId)
      ? settings.defaultTaskListId : undefined)
  ?? taskLists[0]?.id
  ?? ''
```

- [ ] **Step 2.3 — Move scheduling calls inside the `if/else` branches in `handleSave`**

Find `handleSave` starting at line ~118. The current structure is:

```ts
if (existingTask) {
  await updateTask(updated)
} else {
  await createTask(selectedListId, title.trim(), userNotes, metaPatch, dueIso)
}
// If schedule form is open, submit it as part of save
if (showScheduleForm && scheduleFormRef.current) {
  await scheduleFormRef.current.submit()
}
onClose()
```

Replace with (the outer `if (showScheduleForm ...)` block is **removed**; scheduling moves inside each branch):

```ts
if (existingTask) {
  const updated: ExtendedTask = {
    ...existingTask,
    title: title.trim(),
    userNotes,
    due: due ? new Date(due).toISOString() : undefined,
    metadata: { ...existingTask.metadata, ...metaPatch },
  }
  await updateTask(updated)
  // edit mode: task prop is the real ExtendedTask, no override needed
  if (showScheduleForm && scheduleFormRef.current) {
    await scheduleFormRef.current.submit()
  }
} else {
  const dueIso = due ? new Date(due).toISOString() : undefined
  const newTask = await createTask(selectedListId, title.trim(), userNotes, metaPatch, dueIso)
  // new task: pass real ExtendedTask so ScheduleForm has valid id/taskListId
  if (showScheduleForm && scheduleFormRef.current) {
    await scheduleFormRef.current.submit(newTask)
  }
}
onClose()
```

- [ ] **Step 2.4 — Update the Calendar section JSX**

Find the Calendar section starting at line ~340:
```tsx
{/* Linked calendar event */}
{existingTask && (
  <div>
    <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Calendar</label>
    {existingTask.metadata.calendarEventId && !showScheduleForm ? (
      ...
    ) : showScheduleForm ? (
      <ScheduleForm ref={scheduleFormRef} task={existingTask} existingEvent={linkedEvent} onCancel={...} />
    ) : (
      <button onClick={() => setShowScheduleForm(true)}>Schedule on calendar</button>
    )}
  </div>
)}
```

Replace the entire block with (outer `existingTask &&` removed; new-task branch added):

```tsx
{/* Calendar */}
<div>
  <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Calendar</label>
  {existingTask ? (
    existingTask.metadata.calendarEventId && !showScheduleForm ? (
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
            onClick={handleUnschedule}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Unschedule
          </button>
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
      <button
        onClick={() => setShowScheduleForm(true)}
        className="text-xs text-slate-600 border border-dashed border-slate-300 rounded-md px-3 py-1.5 hover:border-blue-400 hover:text-blue-600"
      >
        Schedule on calendar
      </button>
    )
  ) : (
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

Note: `ScheduleForm` is only mounted when `showScheduleForm` is `true` (conditional render), so init values (date, duration) are always captured fresh from the form at the moment the user clicks "Schedule on calendar".

- [ ] **Step 2.5 — Type-check**

```bash
cd /Users/daimyo/Documents/Programming/Projects/Task-Boxer && npx tsc --noEmit
```

Expected: no errors. Common pitfalls:
- If TypeScript complains about the inline object passed as `task` to `ScheduleForm`, verify that `ScheduleTaskInit` is correctly exported from `ScheduleForm.tsx` and the union `ExtendedTask | ScheduleTaskInit` is in `Props`.
- If it complains about `newTask` type, `createTask` already returns `Promise<ExtendedTask>` — verify the return type in `src/stores/tasks-store.ts`.

- [ ] **Step 2.6 — Commit**

```bash
git add src/components/tasks/TaskEditorForm.tsx
git commit -m "feat: expose scheduling section in new task modal and update default list priority"
```

---

## Task 3: Update SettingsPanel — Default task list dropdown

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`

### Background

`AppSettings.defaultTaskListId?: string` already exists in the type (`src/types/task.types.ts`) — no schema change needed. The field just isn't surfaced in the UI.

The `SettingsPanel` already uses `patch` from `useSettingsStore` for all settings mutations (e.g. `patch({ defaultSchedulingCalendarId: ... })`). Follow the same pattern.

- [ ] **Step 3.1 — Add `useTasksStore` import and pull `taskLists`**

At line 1–5 of `src/components/settings/SettingsPanel.tsx`, add the import:

```ts
import { useTasksStore } from '../../stores/tasks-store'
```

Inside the component body (after the existing `const { settings, patch } = useSettingsStore()` line), add:

```ts
const { taskLists } = useTasksStore()
```

- [ ] **Step 3.2 — Add the Default task list dropdown in the Scheduling section**

Inside the Scheduling section's `<div className="flex flex-col gap-3">` (around line 63), after the closing `</div>` of the Default calendar block (around line 80) and before the `{!hasSchedulingCalendar && ...}` block, add:

```tsx
<div>
  <label className="block text-xs text-slate-400 mb-1">Default task list for new tasks</label>
  {taskLists.length === 0 ? (
    <span className="text-xs text-slate-400 italic">Loading lists…</span>
  ) : (
    <select
      value={settings.defaultTaskListId ?? ''}
      onChange={e => patch({ defaultTaskListId: e.target.value || undefined }).catch(console.error)}
      className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
    >
      {taskLists.map(list => (
        <option key={list.id} value={list.id}>{list.title}</option>
      ))}
    </select>
  )}
</div>
```

Note: the `loading` state renders text (not a disabled select) to match the existing pattern on line 66–67 of `SettingsPanel.tsx`. The `patch` call follows the exact pattern as `defaultSchedulingCalendarId` on line 71.

- [ ] **Step 3.3 — Type-check and build**

```bash
cd /Users/daimyo/Documents/Programming/Projects/Task-Boxer && npx tsc --noEmit && npm run build
```

Expected: clean TypeScript, successful Vite build producing the extension bundle in `dist/`.

- [ ] **Step 3.4 — Commit**

```bash
git add src/components/settings/SettingsPanel.tsx
git commit -m "feat: add default task list selector to settings panel"
```

---

## Manual Verification Checklist

After all three tasks, load the extension in Chrome (`chrome://extensions` → Load unpacked → `dist/`) and verify:

**Feature 1 — Scheduling in New Task modal:**
- [ ] Open new task modal (+ button or "New task" in ListView)
- [ ] "Calendar" section is visible below Estimate — shows "Schedule on calendar" dashed button
- [ ] Click "Schedule on calendar" → `ScheduleForm` appears with calendar selector, date (defaults to due date if set), time inputs, day preview
- [ ] Fill in a start time → end time auto-populates based on estimate duration
- [ ] Click Cancel → `ScheduleForm` hides, no event created
- [ ] Fill in schedule details and click Save → task is created, then calendar event is created and linked (visible in CalendarView on that date)
- [ ] Save without opening schedule form → task created with no calendar event (no regression)
- [ ] Edit an existing task → Calendar section still works exactly as before (Reschedule, Unschedule, LinkedEventInfo)

**Feature 2 — Default task list:**
- [ ] Open Settings → Scheduling section shows "Default task list for new tasks" dropdown
- [ ] Select a list (e.g. "My Tasks") → setting persists after closing and reopening Settings
- [ ] Open new task modal with "All lists" filter active → List dropdown pre-selects the default list
- [ ] Open new task modal with a specific list filter active → List dropdown pre-selects that filter's list (contextual default wins)
- [ ] Delete the default list from Google Tasks, reload extension → new task modal falls back gracefully (no crash, selects first available list)
