import { useState } from 'react'
import type { ExtendedTask, TaskMetadata } from '../../types/task.types'
import { useTasksStore } from '../../stores/tasks-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useUIStore } from '../../stores/ui-store'
import ExpandIcon from '../common/ExpandIcon'

const PRIORITY_OPTIONS: Array<TaskMetadata['priority']> = ['none', 'low', 'medium', 'high', 'critical']
const PRIORITY_STYLES: Record<string, string> = {
  none: 'bg-slate-100 text-slate-500',
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
}

interface Props {
  task: ExtendedTask
  onClose: () => void
  accentColour: string
}

export default function TaskItemEditor({ task, onClose, accentColour }: Props) {
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.due?.slice(0, 10) ?? '')
  const [priority, setPriority] = useState<TaskMetadata['priority']>(task.metadata.priority)
  const [tags, setTags] = useState<string[]>(task.metadata.tags)
  const [isSaving, setIsSaving] = useState(false)

  const { updateTask } = useTasksStore()
  const { settings } = useSettingsStore()
  const { openTaskEditor, setEditorInitialTask } = useUIStore()

  async function handleSave() {
    if (!title.trim()) return
    setIsSaving(true)
    try {
      await updateTask({
        ...task,
        title: title.trim(),
        due: due ? new Date(due).toISOString() : undefined,
        metadata: { ...task.metadata, priority, tags },
      })
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  function handleExpand() {
    // Carry dirty state into modal
    setEditorInitialTask({
      ...task,
      title,
      due: due ? new Date(due).toISOString() : undefined,
      metadata: { ...task.metadata, priority, tags },
    })
    openTaskEditor(task.id)
    onClose()
  }

  function toggleTag(tagId: string) {
    setTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId])
  }

  return (
    <div
      style={{ borderRightColor: accentColour }}
      className="bg-white border border-blue-300 border-r-4 rounded-md px-2.5 py-2 shadow-sm"
      onClick={e => e.stopPropagation()}
    >
      {/* Row 1: title + expand button */}
      <div className="flex items-center gap-2 mb-2">
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') onClose()
          }}
          className="flex-1 text-sm font-medium bg-transparent border-0 focus:outline-none text-slate-800"
        />
        <button
          onClick={handleExpand}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-slate-50 border border-slate-200 rounded text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors"
          title="Open full editor"
        >
          <ExpandIcon size={11} />
        </button>
      </div>

      {/* Row 2: chips */}
      <div className="flex flex-wrap gap-1 mb-2 items-center">
        {/* Due date */}
        <input
          type="date"
          value={due}
          onChange={e => setDue(e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
        />

        {/* Priority */}
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as TaskMetadata['priority'])}
          className={`text-xs border-0 rounded-full px-2 py-0.5 focus:outline-none cursor-pointer ${PRIORITY_STYLES[priority]}`}
        >
          {PRIORITY_OPTIONS.map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        {/* Tags */}
        {settings.tags.map(tag => (
          <button
            key={tag.id}
            onClick={() => toggleTag(tag.id)}
            style={tags.includes(tag.id) ? { backgroundColor: tag.colour + '20', color: tag.colour } : {}}
            className={`text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
              tags.includes(tag.id) ? 'border-transparent font-medium' : 'border-slate-200 text-slate-400'
            }`}
          >
            {tag.name}
          </button>
        ))}
      </div>

      {/* Row 3: actions */}
      <div className="flex gap-1.5">
        <button
          onClick={onClose}
          className="flex-1 text-xs py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!title.trim() || isSaving}
          className="flex-1 text-xs py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
