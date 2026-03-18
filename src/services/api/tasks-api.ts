import { apiClient } from './api-client'
import { toExtendedTask, fromExtendedTask, encodeNotes, DEFAULT_METADATA } from '../metadata'
import type { ExtendedTask, ExtendedTaskList, TaskMetadata } from '../../types/task.types'

const BASE = 'https://www.googleapis.com/tasks/v1'

// ─── Raw API shapes ───────────────────────────────────────────────────────────

interface RawTask {
  id?: string
  title?: string
  notes?: string
  status?: string
  due?: string
  completed?: string
  deleted?: boolean
  hidden?: boolean
  links?: Array<{ type: string; description: string; link: string }>
  updated?: string
  selfLink?: string
  etag?: string
  kind?: string
  position?: string
  parent?: string
}

interface RawTaskList {
  id?: string
  title?: string
  selfLink?: string
  updated?: string
  etag?: string
  kind?: string
}

interface TasksListResponse {
  items?: RawTask[]
  nextPageToken?: string
  kind?: string
  etag?: string
}

interface TaskListsResponse {
  items?: RawTaskList[]
  nextPageToken?: string
  kind?: string
  etag?: string
}

// ─── Google Tasks API Wrapper ─────────────────────────────────────────────────

export class TasksApiService {
  private static instance: TasksApiService

  private constructor() {}

  static getInstance(): TasksApiService {
    if (!TasksApiService.instance) {
      TasksApiService.instance = new TasksApiService()
    }
    return TasksApiService.instance
  }

  // ── Task Lists ──────────────────────────────────────────────────────────────

  async listTaskLists(): Promise<ExtendedTaskList[]> {
    const lists: ExtendedTaskList[] = []
    let pageToken: string | undefined

    do {
      const res = await apiClient.get<TaskListsResponse>(`${BASE}/users/@me/lists`, {
        maxResults: 100,
        ...(pageToken ? { pageToken } : {}),
      })

      for (const raw of res.items ?? []) {
        lists.push({
          id: raw.id ?? '',
          title: raw.title ?? '',
          selfLink: raw.selfLink,
          updated: raw.updated,
          etag: raw.etag,
          kind: raw.kind,
        })
      }
      pageToken = res.nextPageToken
    } while (pageToken)

    return lists
  }

  async createTaskList(title: string): Promise<ExtendedTaskList> {
    const raw = await apiClient.post<RawTaskList>(`${BASE}/users/@me/lists`, { title })
    return { id: raw.id ?? '', title: raw.title ?? '' }
  }

  async deleteTaskList(taskListId: string): Promise<void> {
    await apiClient.delete(`${BASE}/users/@me/lists/${taskListId}`)
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────

  /**
   * Fetch all tasks in a task list (handles pagination, includes hidden/deleted).
   */
  async listTasks(
    taskListId: string,
    options: { showCompleted?: boolean; showHidden?: boolean; updatedMin?: string } = {},
  ): Promise<ExtendedTask[]> {
    const tasks: ExtendedTask[] = []
    let pageToken: string | undefined

    do {
      const params: Record<string, string | number | boolean | undefined> = {
        maxResults: 100,
        showCompleted: options.showCompleted ?? true,
        showHidden: options.showHidden ?? false,
        ...(options.updatedMin ? { updatedMin: options.updatedMin } : {}),
        ...(pageToken ? { pageToken } : {}),
      }

      const res = await apiClient.get<TasksListResponse>(
        `${BASE}/lists/${taskListId}/tasks`,
        params,
      )

      for (const raw of res.items ?? []) {
        tasks.push(toExtendedTask(raw, taskListId))
      }
      pageToken = res.nextPageToken
    } while (pageToken)

    return tasks
  }

  async getTask(taskListId: string, taskId: string): Promise<ExtendedTask> {
    const raw = await apiClient.get<RawTask>(`${BASE}/lists/${taskListId}/tasks/${taskId}`)
    return toExtendedTask(raw, taskListId)
  }

  async createTask(
    taskListId: string,
    title: string,
    userNotes: string = '',
    metadata: Partial<TaskMetadata> = {},
    due?: string,
    parent?: string,
  ): Promise<ExtendedTask> {
    const fullMetadata = { ...DEFAULT_METADATA, ...metadata }
    const body: RawTask = {
      title,
      notes: encodeNotes(userNotes, fullMetadata),
      status: 'needsAction',
      ...(due ? { due } : {}),
      ...(parent ? { parent } : {}),
    }

    const params: Record<string, string | undefined> = {}
    if (parent) params.parent = parent

    const raw = await apiClient.request<RawTask>(`${BASE}/lists/${taskListId}/tasks`, {
      method: 'POST',
      body,
      params,
    })
    return toExtendedTask(raw, taskListId)
  }

  async updateTask(task: ExtendedTask): Promise<ExtendedTask> {
    const body = fromExtendedTask(task)
    const raw = await apiClient.put<RawTask>(
      `${BASE}/lists/${task.taskListId}/tasks/${task.id}`,
      body,
    )
    return toExtendedTask(raw, task.taskListId)
  }

  async patchTask(
    taskListId: string,
    taskId: string,
    patch: Partial<RawTask>,
  ): Promise<ExtendedTask> {
    const raw = await apiClient.patch<RawTask>(
      `${BASE}/lists/${taskListId}/tasks/${taskId}`,
      patch,
    )
    return toExtendedTask(raw, taskListId)
  }

  async deleteTask(taskListId: string, taskId: string): Promise<void> {
    await apiClient.delete(`${BASE}/lists/${taskListId}/tasks/${taskId}`)
  }

  async completeTask(taskListId: string, taskId: string): Promise<ExtendedTask> {
    return this.patchTask(taskListId, taskId, {
      status: 'completed',
      completed: new Date().toISOString(),
    })
  }

  async reopenTask(taskListId: string, taskId: string): Promise<ExtendedTask> {
    return this.patchTask(taskListId, taskId, {
      status: 'needsAction',
      completed: undefined,
    })
  }

  /**
   * Move a task to a different position within its list.
   */
  async moveTask(
    taskListId: string,
    taskId: string,
    options: { parent?: string; previous?: string } = {},
  ): Promise<ExtendedTask> {
    const params: Record<string, string | undefined> = {}
    if (options.parent) params.parent = options.parent
    if (options.previous) params.previous = options.previous

    const raw = await apiClient.request<RawTask>(
      `${BASE}/lists/${taskListId}/tasks/${taskId}/move`,
      { method: 'POST', params },
    )
    return toExtendedTask(raw, taskListId)
  }
}

// Export singleton
export const tasksApi = TasksApiService.getInstance()
