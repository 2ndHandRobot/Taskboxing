import type { AppSettings, SyncState, ExtendedTaskList, CalendarInfo } from '../../types/task.types'
import { DEFAULT_SETTINGS } from '../../types/task.types'

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const KEYS = {
  settings: 'settings',
  syncState: 'sync_state',
  taskLists: 'task_lists',
  calendars: 'calendars',
  selectedTaskListIds: 'selected_task_list_ids',
  selectedCalendarIds: 'selected_calendar_ids',
  lastSyncToken: 'last_sync_token',
} as const

// ─── Chrome Storage Wrapper ───────────────────────────────────────────────────

class ChromeStorageService {
  private static instance: ChromeStorageService

  private constructor() {}

  static getInstance(): ChromeStorageService {
    if (!ChromeStorageService.instance) {
      ChromeStorageService.instance = new ChromeStorageService()
    }
    return ChromeStorageService.instance
  }

  // ── Generic get/set ─────────────────────────────────────────────────────────

  private async get<T>(key: string): Promise<T | undefined> {
    const result = await chrome.storage.local.get(key)
    return result[key] as T | undefined
  }

  private async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  }

  private async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key)
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  async getSettings(): Promise<AppSettings> {
    const stored = await this.get<Partial<AppSettings>>(KEYS.settings)
    return { ...DEFAULT_SETTINGS, ...stored }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.set(KEYS.settings, settings)
  }

  async patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings()
    const updated = { ...current, ...patch }
    await this.saveSettings(updated)
    return updated
  }

  // ── Sync State ──────────────────────────────────────────────────────────────

  async getSyncState(): Promise<SyncState> {
    const stored = await this.get<SyncState>(KEYS.syncState)
    return stored ?? { status: 'idle', pendingOperations: 0 }
  }

  async saveSyncState(state: SyncState): Promise<void> {
    await this.set(KEYS.syncState, state)
  }

  async patchSyncState(patch: Partial<SyncState>): Promise<void> {
    const current = await this.getSyncState()
    await this.saveSyncState({ ...current, ...patch })
  }

  // ── Task Lists ──────────────────────────────────────────────────────────────

  async getTaskLists(): Promise<ExtendedTaskList[]> {
    return (await this.get<ExtendedTaskList[]>(KEYS.taskLists)) ?? []
  }

  async saveTaskLists(lists: ExtendedTaskList[]): Promise<void> {
    await this.set(KEYS.taskLists, lists)
  }

  async getSelectedTaskListIds(): Promise<string[]> {
    return (await this.get<string[]>(KEYS.selectedTaskListIds)) ?? []
  }

  async saveSelectedTaskListIds(ids: string[]): Promise<void> {
    await this.set(KEYS.selectedTaskListIds, ids)
  }

  // ── Calendars ───────────────────────────────────────────────────────────────

  async getCalendars(): Promise<CalendarInfo[]> {
    return (await this.get<CalendarInfo[]>(KEYS.calendars)) ?? []
  }

  async saveCalendars(calendars: CalendarInfo[]): Promise<void> {
    await this.set(KEYS.calendars, calendars)
  }

  async getSelectedCalendarIds(): Promise<string[]> {
    return (await this.get<string[]>(KEYS.selectedCalendarIds)) ?? []
  }

  async saveSelectedCalendarIds(ids: string[]): Promise<void> {
    await this.set(KEYS.selectedCalendarIds, ids)
  }

  // ── Sync Tokens (for incremental sync) ──────────────────────────────────────

  async getSyncToken(calendarId: string): Promise<string | undefined> {
    return this.get<string>(`${KEYS.lastSyncToken}:${calendarId}`)
  }

  async saveSyncToken(calendarId: string, token: string): Promise<void> {
    await this.set(`${KEYS.lastSyncToken}:${calendarId}`, token)
  }

  async clearSyncToken(calendarId: string): Promise<void> {
    await this.remove(`${KEYS.lastSyncToken}:${calendarId}`)
  }

  // ── Offline Operation Queue ──────────────────────────────────────────────────

  async getOfflineQueue(): Promise<OfflineOperation[]> {
    return (await this.get<OfflineOperation[]>('offline_queue')) ?? []
  }

  async saveOfflineQueue(queue: OfflineOperation[]): Promise<void> {
    await this.set('offline_queue', queue)
  }

  async enqueueOperation(op: OfflineOperation): Promise<void> {
    const queue = await this.getOfflineQueue()
    queue.push(op)
    await this.saveOfflineQueue(queue)
  }

  async dequeueOperation(): Promise<OfflineOperation | undefined> {
    const queue = await this.getOfflineQueue()
    const op = queue.shift()
    await this.saveOfflineQueue(queue)
    return op
  }

  async clearOfflineQueue(): Promise<void> {
    await this.saveOfflineQueue([])
  }

  // ── Full clear (for logout) ──────────────────────────────────────────────────

  async clearAll(): Promise<void> {
    await chrome.storage.local.clear()
  }
}

// ─── Offline Queue Types ──────────────────────────────────────────────────────

export type OfflineOperationType =
  | 'create_task'
  | 'update_task'
  | 'delete_task'
  | 'complete_task'
  | 'reopen_task'
  | 'create_event'
  | 'update_event'
  | 'delete_event'

export interface OfflineOperation {
  id: string                    // UUID for deduplication
  type: OfflineOperationType
  payload: Record<string, unknown>
  timestamp: string             // ISO 8601
  retryCount: number
}

// Export singleton
export const chromeStorage = ChromeStorageService.getInstance()
