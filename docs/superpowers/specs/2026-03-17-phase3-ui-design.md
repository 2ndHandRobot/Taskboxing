# Phase 3 UI Design — Task Boxer

**Date:** 2026-03-17
**Scope:** Basic UI & Views (side panel shell, list view, task editor, calendar view, tag colour system)

---

## 0. Prerequisites — Type & Settings Updates (already applied)

The following changes have been made to `src/types/task.types.ts` as part of Phase 3 preparation:

**`Tag` type added:**
```ts
export interface Tag {
  id: string        // slug, e.g. "design"
  name: string      // display name, e.g. "Design"
  colour: TagColour // one of 12 preset hex values (see TAG_COLOUR_SWATCHES)
}
```
`colour` is typed as `TagColour`, a union of the 12 preset hex strings exported as `TAG_COLOUR_SWATCHES`.

**`AppSettings.tags: Tag[]` added**, default `[]`. Existing users get an empty tag list on first load (Chrome storage merge fills in the default).

**`TaskMetadata.color` deprecated:** kept in the type to avoid breaking stored metadata, but never read or written by any Phase 3 UI component.

---

## 1. Layout Shell

The side panel uses an **icon side rail** (~36px wide, dark background) pinned to the left edge:

- Four navigation icons (top): List, Calendar, Timeline, Dashboard
- Settings icon (bottom, pinned)
- Sync status indicator (top of rail, above nav icons): spinning during sync, red dot on error

Clicking a nav icon switches the **main content area** to the right of the rail. No labels on the rail.

**Timeline and Dashboard in Phase 3:** both nav icons are active but render a centred placeholder screen ("Coming in a future update"). This prevents blank areas or runtime errors.

**Sync error propagation:** `Layout.tsx` contains a `useEffect` that observes `useTasksStore().error` and `useCalendarStore().error`. When either is non-null it calls `useUIStore().setSyncError(message)`. When both are null it calls `setSyncError(null)`. A dismissible banner at the top of the content area displays `useUIStore().syncError` when present.

**Components:**
- `src/components/layout/SideRail.tsx`
- `src/components/layout/Layout.tsx` — orchestrates mount sequence and error wiring
- `src/sidepanel/App.tsx` — updated to use Layout after auth

---

## 2. List View

**Subheader:**
- **Task list dropdown:** single-select. Options: "All lists" (default) + one entry per synced task list. "All lists" merges tasks from all task lists. Selection is stored in `useUIStore` (ephemeral — resets to "All lists" on session start).
- Filter chips: All / Active / Completed
- Sort button: due date / priority / manual
- "+" button: opens new-task inline editor at top of list

**Grouping:** Tasks grouped by due date:
1. Overdue, 2. Today, 3. Tomorrow, 4. This week, 5. Later, 6. No date

Each group header is collapsible. Completed tasks collapse into a "X completed" disclosure at the bottom of each group.

**Task Item (two-line):**
- Line 1: checkbox · title (medium weight) · priority badge (coloured pill)
- Line 2 (indented): due date (red if overdue) · time estimate · tag pills · subtask count (if > 0)
- Right border: 4px solid, colour from the primary tag (index 0 of `metadata.tags`), looked up from `useSettingsStore().settings.tags` by id. Falls back to `#e2e8f0` (neutral grey) if no tags or tag id not found.
- Completed: strikethrough title, muted colours, no accent

**Components:**
- `src/components/tasks/ListView.tsx`
- `src/components/tasks/TaskGroup.tsx`
- `src/components/tasks/TaskItem.tsx`

---

## 3. Inline Task Editor

Clicking a task row expands it in place. List context stays fully visible.

**Fields:**
- Editable title (text input)
- Due date chip (date picker)
- Priority dropdown
- Tag chips + "+ tag"
- Cancel / Save buttons
- **Expand icon button** (top-right, 20×20px square, `#f8fafc` background, `1px solid #e2e8f0`, `border-radius: 4px`): SVG with two arrowhead corners — bottom-left (↙) and top-right (↗).

**Expand button behaviour:** Clicking carries the current (possibly dirty) inline editor state into `TaskEditorModal` — the modal opens pre-populated with whatever title, due date, priority, and tags are currently shown in the inline editor, whether saved or not. The inline editor closes simultaneously. The user can then save or cancel from the modal.

Escape = cancel (discard). Enter = save (if title non-empty).

**Component:** `src/components/tasks/TaskItemEditor.tsx`

---

## 4. Full Task Editor Modal

Triggered by the expand icon in the inline editor, or "+" for a new task. Dimmed backdrop (`rgba(0,0,0,0.4)`). Single scrollable column.

**Fields:**
1. Title — full-width text input
2. Notes — textarea (3–4 lines, auto-expands)
3. Due date — date picker chip
4. Priority — pill selector: None / Low / Medium / High / Critical
5. **Time constraint** — dropdown with all 9 variants, grouped:

   | Group | Options |
   |-------|---------|
   | No constraint | Anytime |
   | Work hours | Work hours only, Before work, After work, Not during work |
   | Specific time | Fixed time, Time window, Before time, After time |

   Selecting a specific-time variant reveals a secondary input below the dropdown:
   - Fixed time → datetime input
   - Time window → start datetime + end datetime inputs
   - Before time / After time → HH:MM time input

6. Tags — tag chips with colour dots; "+ add tag" opens popover: existing tags (click to toggle) + "Create new" (name input + `TAG_COLOUR_SWATCHES` swatch picker)
7. Estimate — hour/minute inputs; shows "Avg: Xh Ym from N past tasks" if historical data exists
8. Progress — 0–100% slider. **Shown only when `estimatedMinutes` is defined and > 0.** Clearing the estimate sets `progressPercent` to 0 and hides the slider.
9. Subtasks — checklist fetched from `useTasksStore()` by filtering `task.metadata.parentTaskId === currentTask.id` across the current task list. Inline add (Enter to append). Drag-to-reorder via dnd-kit (reorders in local state; persisted on Save).
10. Dependencies — "Blocked by" search: text input searches `title` across all tasks in all synced lists; shows dropdown of matches; selected tasks shown as removable chips.
11. Linked calendar event — shows event title + calendar name if `metadata.calendarEventId` is set; "Schedule on calendar" button is present but **disabled** in Phase 3 (tooltip: "Coming soon").

**Footer:** Delete (left, red, inline confirmation "Delete this task?" with Confirm/Cancel) · Cancel · Save

**Components:**
- `src/components/tasks/TaskEditorModal.tsx`
- `src/components/tasks/TaskEditorForm.tsx`
- `src/components/tasks/TimeConstraintSelector.tsx`
- `src/components/tasks/SubtaskList.tsx`
- `src/components/tasks/DependencyPicker.tsx`

---

## 5. Calendar View

**Subheader:**
- Prev / Next month arrows
- Month + year label (centred)
- "Today" button
- Calendar selector: popover with checkboxes per synced calendar (colour dot from `CalendarInfo.backgroundColor`).

**Calendar selector initial state:** `calendarStore.selectedCalendarIds` initialises to `[]`. The UI interprets an empty array as "all calendars selected" — all checkboxes render as checked. When a user unchecks a calendar, its id is added to a local exclusion set; the store is updated with all-except-excluded ids and persisted via `chromeStorage.saveSelectedCalendarIds()`. First-time users see all calendars checked without any storage write until they make a change.

**Month grid:** 7-column × 5–6 row. Each day cell:
- Calendar event pills (calendar's `backgroundColor`)
- Task due-date chips with a checkbox (checking calls `tasksStore.completeTask()`)
- "+N more" if overflow → day popover listing all items

**Interactions:**
- Click event pill → read-only `EventPopover` (title, time, calendar name, description, "Edit in Google Calendar" link)
- Click task chip → opens `TaskEditorModal` directly (no inline expand — no row context inside a day cell)
- Click empty day → `TaskEditorModal` (new task, due date pre-filled)

**Components:**
- `src/components/calendar/CalendarView.tsx`
- `src/components/calendar/MonthGrid.tsx`
- `src/components/calendar/DayCell.tsx`
- `src/components/calendar/EventPopover.tsx`

---

## 6. Tag Colour System

Tags are global, stored in `AppSettings.tags`. Each tag has `id` (slug), `name`, and `colour` (`TagColour` — one of 12 preset hex values from `TAG_COLOUR_SWATCHES`).

The **primary tag** (index 0 of `task.metadata.tags`) drives the task item right-border accent. Colour is looked up by matching `tag.id` from `settings.tags`. Falls back to `#e2e8f0` if not found.

Tag management (rename, reorder, delete) is deferred to Phase 10.

---

## 7. Data & Store Wiring

`Layout.tsx` orchestrates on mount (after auth):
1. `settingsStore.load()` — Chrome storage, blocking (settings needed before render)
2. `tasksStore.loadFromCache()` + `calendarStore.loadFromCache()` — IndexedDB, parallel, for instant display
3. `tasksStore.syncTaskLists()` → `tasksStore.syncAllTasks()` — background
4. `calendarStore.syncCalendars()` → `calendarStore.syncAllEvents()` — background, parallel with step 3

`loadFromCache()` applies to tasks and calendar stores only (IndexedDB-backed). Settings always load directly from Chrome storage — no cache layer.

Error propagation: `useEffect` in `Layout.tsx` watches `tasksStore.error` + `calendarStore.error` → `useUIStore().setSyncError()`.

---

## 8. Out of Scope for Phase 3

- Timeline / Gantt view (Phase 6) — placeholder screen shown
- Dashboard view (Phase 7) — placeholder screen shown
- Smart scheduling / "Schedule on calendar" action (Phase 5) — button disabled
- Offline queue / conflict resolution (Phase 4)
- Tag management UI — rename, reorder, delete (Phase 10)
- Keyboard shortcuts (Phase 9)
- Drag-and-drop task reordering in list view (Phase 9)
- Week/day calendar views (Phase 6)
