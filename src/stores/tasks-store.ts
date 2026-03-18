import { create } from 'zustand'
import { tasksApi } from '../services/api/tasks-api'
import { idb } from '../services/storage/indexeddb'
import { updateTaskMetadata } from '../services/metadata'
import type { ExtendedTask, ExtendedTaskList, TaskMetadata } from '../types/task.types'

interface TasksStore {
  // State
  tasks: Record<string, ExtendedTask>       // keyed by task id
  taskLists: ExtendedTaskList[]
  selectedTaskListIds: string[]
  isLoading: boolean
  error: string | null

  // Selectors (computed from state)
  getTasksByList: (listId: string) => ExtendedTask[]
  getTask: (id: string) => ExtendedTask | undefined

  // Actions
  loadFromCache: () => Promise<void>
  syncTaskLists: () => Promise<void>
  syncTasks: (taskListId: string) => Promise<void>
  syncAllTasks: () => Promise<void>
  createTask: (
    taskListId: string,
    title: string,
    userNotes?: string,
    metadata?: Partial<TaskMetadata>,
    due?: string,
    parent?: string,
  ) => Promise<ExtendedTask>
  updateTask: (task: ExtendedTask) => Promise<ExtendedTask>
  updateTaskMeta: (taskId: string, patch: Partial<TaskMetadata>) => Promise<ExtendedTask>
  deleteTask: (taskListId: string, taskId: string) => Promise<void>
  completeTask: (taskListId: string, taskId: string) => Promise<ExtendedTask>
  reopenTask: (taskListId: string, taskId: string) => Promise<ExtendedTask>
  setSelectedTaskListIds: (ids: string[]) => void
  clearError: () => void
}

export const useTasksStore = create<TasksStore>((set, get) => ({
  tasks: {},
  taskLists: [],
  selectedTaskListIds: [],
  isLoading: false,
  error: null,

  // ── Selectors ────────────────────────────────────────────────────────────────

  getTasksByList: (listId) => {
    return Object.values(get().tasks).filter((t) => t.taskListId === listId)
  },

  getTask: (id) => get().tasks[id],

  // ── Actions ──────────────────────────────────────────────────────────────────

  loadFromCache: async () => {
    try {
      const cached = await idb.getAllTasks()
      const taskMap: Record<string, ExtendedTask> = {}
      for (const task of cached) {
        taskMap[task.id] = task
      }
      set({ tasks: taskMap })
    } catch (err) {
      console.error('Failed to load tasks from cache:', err)
    }
  },

  syncTaskLists: async () => {
    set({ isLoading: true, error: null })
    try {
      const lists = await tasksApi.listTaskLists()
      set({ taskLists: lists, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load task lists'
      set({ isLoading: false, error: message })
    }
  },

  syncTasks: async (taskListId) => {
    set({ isLoading: true, error: null })
    try {
      const tasks = await tasksApi.listTasks(taskListId)
      await idb.saveTasks(tasks)

      set((state) => {
        const updated = { ...state.tasks }
        // Remove stale tasks for this list
        for (const [id, task] of Object.entries(updated)) {
          if (task.taskListId === taskListId) delete updated[id]
        }
        for (const task of tasks) {
          updated[task.id] = task
        }
        return { tasks: updated, isLoading: false }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync tasks'
      set({ isLoading: false, error: message })
    }
  },

  syncAllTasks: async () => {
    const { selectedTaskListIds, taskLists, syncTasks } = get()
    const idsToSync = selectedTaskListIds.length > 0
      ? selectedTaskListIds
      : taskLists.map((l) => l.id)

    for (const id of idsToSync) {
      await syncTasks(id)
    }
  },

  createTask: async (taskListId, title, userNotes, metadata, due, parent) => {
    const task = await tasksApi.createTask(taskListId, title, userNotes, metadata, due, parent)
    await idb.saveTask(task)
    set((state) => ({ tasks: { ...state.tasks, [task.id]: task } }))
    return task
  },

  updateTask: async (task) => {
    const updated = await tasksApi.updateTask(task)
    await idb.saveTask(updated)
    set((state) => ({ tasks: { ...state.tasks, [updated.id]: updated } }))
    return updated
  },

  updateTaskMeta: async (taskId, patch) => {
    const task = get().tasks[taskId]
    if (!task) throw new Error(`Task ${taskId} not found`)
    const patched = updateTaskMetadata(task, patch)
    return get().updateTask(patched)
  },

  deleteTask: async (taskListId, taskId) => {
    await tasksApi.deleteTask(taskListId, taskId)
    await idb.deleteTask(taskId)
    set((state) => {
      const updated = { ...state.tasks }
      delete updated[taskId]
      return { tasks: updated }
    })
  },

  completeTask: async (taskListId, taskId) => {
    const task = await tasksApi.completeTask(taskListId, taskId)
    await idb.saveTask(task)
    set((state) => ({ tasks: { ...state.tasks, [task.id]: task } }))
    return task
  },

  reopenTask: async (taskListId, taskId) => {
    const task = await tasksApi.reopenTask(taskListId, taskId)
    await idb.saveTask(task)
    set((state) => ({ tasks: { ...state.tasks, [task.id]: task } }))
    return task
  },

  setSelectedTaskListIds: (ids) => set({ selectedTaskListIds: ids }),

  clearError: () => set({ error: null }),
}))
