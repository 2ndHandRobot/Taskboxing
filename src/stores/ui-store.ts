import { create } from 'zustand'
import type { ExtendedCalendarEvent, ExtendedTask } from '../types/task.types'

export type ActiveView = 'list' | 'calendar' | 'timeline' | 'dashboard'

export type CalendarEventPopover = { event: ExtendedCalendarEvent; rect: DOMRect }

interface UIStore {
  // Navigation
  activeView: ActiveView
  selectedTaskId: string | null
  selectedTaskListId: string | null
  isTaskEditorOpen: boolean

  // Sync status banner
  syncError: string | null

  // List view filter/sort (ephemeral)
  activeTaskListFilter: string | null   // null = "All lists"
  taskFilter: 'all' | 'active' | 'completed'
  taskSort: 'due' | 'priority' | 'manual'

  // Task editor — when opening modal with pre-populated data from inline editor
  editorInitialTask: Partial<ExtendedTask> | null
  editorIsNew: boolean   // true = creating a new task

  // Settings panel
  showSettings: boolean
  toggleSettings: () => void

  // Calendar event popover (global — only one open at a time)
  calendarEventPopover: CalendarEventPopover | null
  setCalendarEventPopover: (popover: CalendarEventPopover | null) => void

  // Actions
  setActiveView: (view: ActiveView) => void
  selectTask: (taskId: string | null) => void
  selectTaskList: (listId: string | null) => void
  openTaskEditor: (taskId?: string) => void
  closeTaskEditor: () => void
  setSyncError: (error: string | null) => void
  setActiveTaskListFilter: (id: string | null) => void
  setTaskFilter: (filter: 'all' | 'active' | 'completed') => void
  setTaskSort: (sort: 'due' | 'priority' | 'manual') => void
  setEditorInitialTask: (task: Partial<ExtendedTask> | null, isNew?: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeView: 'list',
  selectedTaskId: null,
  selectedTaskListId: null,
  isTaskEditorOpen: false,
  syncError: null,
  activeTaskListFilter: null,
  taskFilter: 'all',
  taskSort: 'due',
  editorInitialTask: null,
  editorIsNew: false,
  showSettings: false,
  calendarEventPopover: null,

  setActiveView: (view) => set({ activeView: view }),

  selectTask: (taskId) => set({ selectedTaskId: taskId }),

  selectTaskList: (listId) => set({ selectedTaskListId: listId }),

  openTaskEditor: (taskId) =>
    set({
      isTaskEditorOpen: true,
      selectedTaskId: taskId ?? null,
      editorIsNew: !taskId,
      calendarEventPopover: null,  // close any open event popover
    }),

  closeTaskEditor: () => set({ isTaskEditorOpen: false, editorInitialTask: null, editorIsNew: false }),

  setSyncError: (error) => set({ syncError: error }),

  setActiveTaskListFilter: (id) => set({ activeTaskListFilter: id }),

  setTaskFilter: (filter) => set({ taskFilter: filter }),

  setTaskSort: (sort) => set({ taskSort: sort }),

  setEditorInitialTask: (task, isNew = false) => set({ editorInitialTask: task, editorIsNew: isNew }),

  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings, calendarEventPopover: null })),

  setCalendarEventPopover: (popover) => set({ calendarEventPopover: popover }),
}))
