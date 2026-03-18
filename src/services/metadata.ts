import type { TaskMetadata, ExtendedTask } from '../types/task.types'

const METADATA_DELIMITER = '---METADATA---'
const CURRENT_VERSION = 1

export const DEFAULT_METADATA: TaskMetadata = {
  version: CURRENT_VERSION,
  priority: 'none',
  tags: [],
  progressPercent: 0,
  timeConstraint: { type: 'anytime' },
  dependencies: [],
  timeEntries: [],
}

/**
 * Encode metadata into a notes string.
 * User-visible notes are stored before the delimiter.
 */
export function encodeNotes(userNotes: string, metadata: TaskMetadata): string {
  const json = JSON.stringify({ ...metadata, version: CURRENT_VERSION })
  const notes = userNotes.trim()
  return notes ? `${notes}\n${METADATA_DELIMITER}\n${json}` : `${METADATA_DELIMITER}\n${json}`
}

/**
 * Decode a raw notes string into user notes + metadata.
 * Returns default metadata if the delimiter is absent or JSON is malformed.
 */
export function decodeNotes(raw: string | undefined): { userNotes: string; metadata: TaskMetadata } {
  if (!raw) {
    return { userNotes: '', metadata: { ...DEFAULT_METADATA } }
  }

  const delimIdx = raw.indexOf(METADATA_DELIMITER)
  if (delimIdx === -1) {
    return { userNotes: raw.trim(), metadata: { ...DEFAULT_METADATA } }
  }

  const userNotes = raw.slice(0, delimIdx).trim()
  const jsonStr = raw.slice(delimIdx + METADATA_DELIMITER.length).trim()

  try {
    const parsed = JSON.parse(jsonStr) as Partial<TaskMetadata>
    const metadata: TaskMetadata = {
      ...DEFAULT_METADATA,
      ...parsed,
    }
    return { userNotes, metadata }
  } catch {
    console.warn('Failed to parse task metadata JSON, using defaults')
    return { userNotes, metadata: { ...DEFAULT_METADATA } }
  }
}

/**
 * Apply a partial metadata update to an ExtendedTask, re-encoding the notes field.
 */
export function updateTaskMetadata(
  task: ExtendedTask,
  patch: Partial<TaskMetadata>,
): ExtendedTask {
  const updatedMetadata: TaskMetadata = { ...task.metadata, ...patch }
  const updatedNotes = encodeNotes(task.userNotes, updatedMetadata)
  return {
    ...task,
    notes: updatedNotes,
    metadata: updatedMetadata,
  }
}

/**
 * Convert a raw Google Tasks API task object into an ExtendedTask.
 */
export function toExtendedTask(
  raw: GoogleTasksTask,
  taskListId: string,
): ExtendedTask {
  const { userNotes, metadata } = decodeNotes(raw.notes)
  return {
    id: raw.id ?? '',
    taskListId,
    title: raw.title ?? '',
    notes: raw.notes,
    status: raw.status === 'completed' ? 'completed' : 'needsAction',
    due: raw.due,
    completed: raw.completed,
    deleted: raw.deleted,
    hidden: raw.hidden,
    links: raw.links,
    updated: raw.updated,
    selfLink: raw.selfLink,
    etag: raw.etag,
    kind: raw.kind,
    position: raw.position,
    parent: raw.parent,
    metadata,
    userNotes,
  }
}

/**
 * Convert an ExtendedTask back to the shape expected by the Google Tasks API.
 */
export function fromExtendedTask(task: ExtendedTask): GoogleTasksTask {
  return {
    id: task.id,
    title: task.title,
    notes: encodeNotes(task.userNotes, task.metadata),
    status: task.status,
    due: task.due,
    completed: task.completed,
  }
}

// Minimal shape of what the Google Tasks API returns — full types come from tasks-api.ts
interface GoogleTasksTask {
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
