import type { ExtendedTask, ExtendedCalendarEvent } from '../../types/task.types'

// ─── Schema ───────────────────────────────────────────────────────────────────

const DB_NAME = 'task-boxer'
const DB_VERSION = 1

const STORES = {
  tasks: 'tasks',
  events: 'events',
} as const

// ─── IndexedDB Manager ────────────────────────────────────────────────────────

class IndexedDBManager {
  private static instance: IndexedDBManager
  private db: IDBDatabase | null = null

  private constructor() {}

  static getInstance(): IndexedDBManager {
    if (!IndexedDBManager.instance) {
      IndexedDBManager.instance = new IndexedDBManager()
    }
    return IndexedDBManager.instance
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Tasks store: indexed by taskListId and status
        if (!db.objectStoreNames.contains(STORES.tasks)) {
          const taskStore = db.createObjectStore(STORES.tasks, { keyPath: 'id' })
          taskStore.createIndex('taskListId', 'taskListId', { unique: false })
          taskStore.createIndex('status', 'status', { unique: false })
          taskStore.createIndex('due', 'due', { unique: false })
          taskStore.createIndex('updated', 'updated', { unique: false })
        }

        // Events store: indexed by calendarId and start time
        if (!db.objectStoreNames.contains(STORES.events)) {
          const eventStore = db.createObjectStore(STORES.events, { keyPath: 'id' })
          eventStore.createIndex('calendarId', 'calendarId', { unique: false })
          eventStore.createIndex('updated', 'updated', { unique: false })
        }
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result
        resolve(this.db)
      }

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`))
      }
    })
  }

  async close(): Promise<void> {
    this.db?.close()
    this.db = null
  }

  private async getDB(): Promise<IDBDatabase> {
    return this.db ?? this.open()
  }

  // ── Generic helpers ──────────────────────────────────────────────────────────

  private tx(
    db: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode,
  ): IDBObjectStore {
    return db.transaction(storeName, mode).objectStore(storeName)
  }

  private promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  private promisifyAll<T>(request: IDBRequest<T[]>): Promise<T[]> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? [])
      request.onerror = () => reject(request.error)
    })
  }

  // ── Tasks ────────────────────────────────────────────────────────────────────

  async saveTask(task: ExtendedTask): Promise<void> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.tasks, 'readwrite')
    await this.promisify(store.put(task))
  }

  async saveTasks(tasks: ExtendedTask[]): Promise<void> {
    const db = await this.getDB()
    const tx = db.transaction(STORES.tasks, 'readwrite')
    const store = tx.objectStore(STORES.tasks)

    await Promise.all(tasks.map((task) => this.promisify(store.put(task))))
  }

  async getTask(id: string): Promise<ExtendedTask | undefined> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.tasks, 'readonly')
    return this.promisify(store.get(id)) as Promise<ExtendedTask | undefined>
  }

  async getTasksByList(taskListId: string): Promise<ExtendedTask[]> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.tasks, 'readonly')
    const index = store.index('taskListId')
    return this.promisifyAll(index.getAll(taskListId)) as Promise<ExtendedTask[]>
  }

  async getAllTasks(): Promise<ExtendedTask[]> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.tasks, 'readonly')
    return this.promisifyAll(store.getAll()) as Promise<ExtendedTask[]>
  }

  async deleteTask(id: string): Promise<void> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.tasks, 'readwrite')
    await this.promisify(store.delete(id))
  }

  async deleteTasksByList(taskListId: string): Promise<void> {
    const tasks = await this.getTasksByList(taskListId)
    const db = await this.getDB()
    const tx = db.transaction(STORES.tasks, 'readwrite')
    const store = tx.objectStore(STORES.tasks)
    await Promise.all(tasks.map((t) => this.promisify(store.delete(t.id))))
  }

  async clearTasks(): Promise<void> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.tasks, 'readwrite')
    await this.promisify(store.clear())
  }

  async countTasks(): Promise<number> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.tasks, 'readonly')
    return this.promisify(store.count())
  }

  // ── Calendar Events ──────────────────────────────────────────────────────────

  async saveEvent(event: ExtendedCalendarEvent): Promise<void> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.events, 'readwrite')
    await this.promisify(store.put(event))
  }

  async saveEvents(events: ExtendedCalendarEvent[]): Promise<void> {
    const db = await this.getDB()
    const tx = db.transaction(STORES.events, 'readwrite')
    const store = tx.objectStore(STORES.events)
    await Promise.all(events.map((event) => this.promisify(store.put(event))))
  }

  async getEvent(id: string): Promise<ExtendedCalendarEvent | undefined> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.events, 'readonly')
    return this.promisify(store.get(id)) as Promise<ExtendedCalendarEvent | undefined>
  }

  async getEventsByCalendar(calendarId: string): Promise<ExtendedCalendarEvent[]> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.events, 'readonly')
    const index = store.index('calendarId')
    return this.promisifyAll(index.getAll(calendarId)) as Promise<ExtendedCalendarEvent[]>
  }

  async getAllEvents(): Promise<ExtendedCalendarEvent[]> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.events, 'readonly')
    return this.promisifyAll(store.getAll()) as Promise<ExtendedCalendarEvent[]>
  }

  async deleteEvent(id: string): Promise<void> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.events, 'readwrite')
    await this.promisify(store.delete(id))
  }

  async clearEvents(): Promise<void> {
    const db = await this.getDB()
    const store = this.tx(db, STORES.events, 'readwrite')
    await this.promisify(store.clear())
  }

  // ── Full clear (for logout) ──────────────────────────────────────────────────

  async clearAll(): Promise<void> {
    await Promise.all([this.clearTasks(), this.clearEvents()])
  }
}

// Export singleton
export const idb = IndexedDBManager.getInstance()
