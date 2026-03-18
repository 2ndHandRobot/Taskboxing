import { useState } from 'react'
import type { ExtendedTask, TaskMetadata, TimeConstraint, TaskDependency } from '../../types/task.types'
import { useTasksStore } from '../../stores/tasks-store'
import { useCalendarStore } from '../../stores/calendar-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useUIStore } from '../../stores/ui-store'
import TimeConstraintSelector from './TimeConstraintSelector'
import SubtaskList from './SubtaskList'
import type { SubtaskItem } from './SubtaskList'
import DependencyPicker from './DependencyPicker'

// Sub-component: looks up and displays the linked calendar event title + calendar name
function LinkedEventInfo({ eventId, calendarId }: { eventId: string; calendarId?: string }) {
  const { events, calendars } = useCalendarStore()
  const event = events[eventId]
  const calendar = calendars.find(c => c.id === calendarId)
  if (!event) return <span className="text-xs text-slate-400">Linked event (not loaded)</span>
  return (
    <div className="text-xs text-slate-600">
      <span className="font-medium">{event.summary}</span>
      {calendar && <span className="text-slate-400 ml-1">· {calendar.summary}</span>}
    </div>
  )
}

const PRIORITY_OPTIONS = ['none', 'low', 'medium', 'high', 'critical'] as const
const PRIORITY_LABELS: Record<string, string> = {
  none: 'None', low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
}
const PRIORITY_STYLES: Record<string, string> = {
  none: 'bg-slate-100 text-slate-500',
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
}

interface Props {
  taskId: string | null          // null = new task
  initialData: Partial<ExtendedTask> | null
  onClose: () => void
}

export default function TaskEditorForm({ taskId, initialData, onClose }: Props) {
  const { tasks, taskLists, createTask, updateTask, deleteTask } = useTasksStore()
  const { settings } = useSettingsStore()
  const { activeTaskListFilter } = useUIStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const existingTask = taskId ? tasks[taskId] : null

  // Helper: extract YYYY-MM-DD from a due string (ISO or date-only)
  function toDueDate(due?: string): string {
    if (!due) return ''
    return due.slice(0, 10)
  }

  // Form state
  const [title, setTitle] = useState(existingTask?.title ?? initialData?.title ?? '')
  const [userNotes, setUserNotes] = useState(existingTask?.userNotes ?? '')
  const [due, setDue] = useState(toDueDate(existingTask?.due ?? initialData?.due))
  const [priority, setPriority] = useState<TaskMetadata['priority']>(
    existingTask?.metadata.priority ?? initialData?.metadata?.priority ?? 'none'
  )
  const [timeConstraint, setTimeConstraint] = useState<TimeConstraint>(
    existingTask?.metadata.timeConstraint ?? initialData?.metadata?.timeConstraint ?? { type: 'anytime' }
  )
  const [tags, setTags] = useState<string[]>(
    existingTask?.metadata.tags ?? initialData?.metadata?.tags ?? []
  )
  const [estimatedHours, setEstimatedHours] = useState<string>(() => {
    const mins = existingTask?.metadata.estimatedMinutes
    return mins ? String(Math.floor(mins / 60)) : ''
  })
  const [estimatedMins, setEstimatedMins] = useState<string>(() => {
    const mins = existingTask?.metadata.estimatedMinutes
    return mins ? String(mins % 60) : ''
  })
  const [progressPercent, setProgressPercent] = useState(
    existingTask?.metadata.progressPercent ?? 0
  )
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(() => {
    if (!taskId) return []
    return Object.values(tasks)
      .filter(t => t.metadata.parentTaskId === taskId)
      .map(t => ({ id: t.id, title: t.title, completed: t.status === 'completed' }))
  })
  const [dependencies, setDependencies] = useState<TaskDependency[]>(
    existingTask?.metadata.dependencies ?? []
  )

  // For new tasks: which list to create in (user-selectable)
  const defaultListId = existingTask?.taskListId
    ?? activeTaskListFilter
    ?? taskLists[0]?.id
    ?? ''
  const [selectedListId, setSelectedListId] = useState(defaultListId)

  const estimatedMinutes = (parseInt(estimatedHours || '0') * 60) + parseInt(estimatedMins || '0')
  const hasEstimate = estimatedMinutes > 0

  async function handleSave() {
    if (!title.trim()) return
    setIsSaving(true)
    try {
      const metaPatch: Partial<TaskMetadata> = {
        priority,
        tags,
        timeConstraint,
        estimatedMinutes: hasEstimate ? estimatedMinutes : undefined,
        progressPercent: hasEstimate ? progressPercent : 0,
        dependencies,
      }
      if (existingTask) {
        const updated: ExtendedTask = {
          ...existingTask,
          title: title.trim(),
          userNotes,
          due: due ? new Date(due).toISOString() : undefined,
          metadata: { ...existingTask.metadata, ...metaPatch },
        }
        await updateTask(updated)
      } else {
        await createTask(selectedListId, title.trim(), userNotes, metaPatch, due || undefined)
      }
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!existingTask) return
    await deleteTask(existingTask.taskListId, existingTask.id)
    onClose()
  }

  function toggleTag(tagId: string) {
    setTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId])
  }

  return (
    <div className="flex flex-col max-h-[85vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">
          {existingTask ? 'Edit Task' : 'New Task'}
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">

        {/* Title */}
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="Task title"
          className="w-full text-sm font-medium border-0 border-b border-slate-200 pb-1 focus:outline-none focus:border-blue-400 bg-transparent"
        />

        {/* Task list selector — only for new tasks */}
        {!existingTask && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">List</label>
            {taskLists.length === 0 ? (
              <span className="text-xs text-slate-400 italic">Loading lists…</span>
            ) : (
              <select
                value={selectedListId}
                onChange={e => setSelectedListId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {taskLists.map(list => (
                  <option key={list.id} value={list.id}>{list.title}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Notes */}
        <textarea
          value={userNotes}
          onChange={e => setUserNotes(e.target.value)}
          placeholder="Notes..."
          rows={3}
          className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        />

        {/* Due date */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Due date</label>
          <input
            type="date"
            value={due}
            onChange={e => setDue(e.target.value)}
            className="text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Priority</label>
          <div className="flex gap-1 flex-wrap">
            {PRIORITY_OPTIONS.map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  priority === p
                    ? `${PRIORITY_STYLES[p]} border-transparent font-medium`
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Time constraint */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Time constraint</label>
          <TimeConstraintSelector value={timeConstraint} onChange={setTimeConstraint} />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Tags</label>
          <div className="flex flex-wrap gap-1">
            {settings.tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                style={tags.includes(tag.id) ? { backgroundColor: tag.colour + '20', color: tag.colour, borderColor: tag.colour } : {}}
                className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                  tags.includes(tag.id) ? 'font-medium' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {tag.name}
              </button>
            ))}
            {settings.tags.length === 0 && (
              <span className="text-xs text-slate-400 italic">No tags yet — add them in Settings</span>
            )}
          </div>
        </div>

        {/* Estimate */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Estimate</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min="0"
              value={estimatedHours}
              onChange={e => setEstimatedHours(e.target.value)}
              placeholder="0"
              className="w-16 text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <span className="text-xs text-slate-400">h</span>
            <input
              type="number"
              min="0"
              max="59"
              value={estimatedMins}
              onChange={e => setEstimatedMins(e.target.value)}
              placeholder="0"
              className="w-16 text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <span className="text-xs text-slate-400">min</span>
          </div>
        </div>

        {/* Progress (only when estimate > 0) */}
        {hasEstimate && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">
              Progress — {progressPercent}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={progressPercent}
              onChange={e => setProgressPercent(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
        )}

        {/* Subtasks */}
        {existingTask && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">
              Subtasks ({subtasks.length})
            </label>
            <SubtaskList items={subtasks} onChange={setSubtasks} />
          </div>
        )}

        {/* Dependencies */}
        {existingTask && (
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Blocked by</label>
            <DependencyPicker
              currentTaskId={existingTask.id}
              dependencies={dependencies}
              onChange={setDependencies}
            />
          </div>
        )}

        {/* Linked calendar event */}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Calendar</label>
          {existingTask?.metadata.calendarEventId ? (
            <LinkedEventInfo
              eventId={existingTask.metadata.calendarEventId}
              calendarId={existingTask.metadata.calendarId}
            />
          ) : (
            <button
              disabled
              title="Coming soon"
              className="text-xs text-slate-400 border border-dashed border-slate-300 rounded-md px-3 py-1.5 cursor-not-allowed"
            >
              Schedule on calendar
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100">
        {existingTask && !showDeleteConfirm && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs text-red-500 hover:text-red-700 mr-auto"
          >
            Delete
          </button>
        )}
        {showDeleteConfirm && (
          <div className="flex items-center gap-1.5 mr-auto">
            <span className="text-xs text-slate-600">Delete this task?</span>
            <button onClick={handleDelete} className="text-xs text-red-500 font-medium hover:text-red-700">Confirm</button>
            <button onClick={() => setShowDeleteConfirm(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        )}
        <button onClick={onClose} className="ml-auto text-sm px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!title.trim() || isSaving || (!existingTask && !selectedListId)}
          className="text-sm px-4 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
