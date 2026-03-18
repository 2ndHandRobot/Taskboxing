import { useState } from 'react'
import { format, isPast, isToday } from 'date-fns'
import type { ExtendedTask } from '../../types/task.types'
import { useSettingsStore } from '../../stores/settings-store'
import { useCompleteTask } from '../../hooks/useCompleteTask'
import TaskItemEditor from './TaskItemEditor'

const PRIORITY_COLOURS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-slate-100 text-slate-600',
  none: '',
}

interface TaskItemProps {
  task: ExtendedTask
}

export default function TaskItem({ task }: TaskItemProps) {
  const [expanded, setExpanded] = useState(false)
  const { settings } = useSettingsStore()
  const { completeTask, uncompleteTask } = useCompleteTask()

  // Resolve primary tag colour
  const primaryTagId = task.metadata.tags[0]
  const primaryTag = settings.tags.find(t => t.id === primaryTagId)
  const accentColour = primaryTag?.colour ?? '#e2e8f0'

  const isCompleted = task.status === 'completed'
  const dueDate = task.due ? new Date(task.due) : null
  const dueDateStr = dueDate ? format(dueDate, 'MMM d') : null
  const isOverdue = dueDate && !isCompleted && isPast(dueDate) && !isToday(dueDate)

  async function handleToggleComplete(e: React.MouseEvent) {
    e.stopPropagation()
    if (isCompleted) {
      await uncompleteTask(task)
    } else {
      await completeTask(task)
    }
  }

  if (expanded) {
    return (
      <TaskItemEditor
        task={task}
        onClose={() => setExpanded(false)}
        accentColour={accentColour}
      />
    )
  }

  return (
    <div
      onClick={() => !isCompleted && setExpanded(true)}
      style={{ borderRightColor: accentColour }}
      className={`bg-white border border-slate-200 border-r-4 rounded-md px-2.5 py-2 cursor-pointer hover:border-slate-300 transition-colors ${isCompleted ? 'opacity-60 cursor-default' : ''}`}
    >
      {/* Line 1 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggleComplete}
          className="flex-shrink-0 w-4 h-4 rounded border border-slate-300 flex items-center justify-center hover:border-blue-400 transition-colors"
          aria-label={isCompleted ? 'Reopen task' : 'Complete task'}
        >
          {isCompleted && (
            <svg className="w-3 h-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </button>

        <span className={`flex-1 text-sm font-medium truncate ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {task.title}
        </span>

        {task.metadata.priority !== 'none' && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${PRIORITY_COLOURS[task.metadata.priority] ?? ''}`}>
            {task.metadata.priority.charAt(0).toUpperCase() + task.metadata.priority.slice(1)}
          </span>
        )}
      </div>

      {/* Line 2 */}
      {!isCompleted && (dueDateStr || task.metadata.estimatedMinutes || task.metadata.tags.length > 0) && (
        <div className="flex items-center gap-1.5 mt-1 ml-6 flex-wrap">
          {dueDateStr && (
            <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
              📅 {dueDateStr}{isOverdue ? ' ⚠' : ''}
            </span>
          )}
          {task.metadata.estimatedMinutes && (
            <span className="text-xs text-slate-400">
              ⏱ {formatMinutes(task.metadata.estimatedMinutes)}
            </span>
          )}
          {task.metadata.tags.slice(0, 3).map(tagId => {
            const tag = settings.tags.find(t => t.id === tagId)
            return tag ? (
              <span
                key={tagId}
                style={{ backgroundColor: tag.colour + '20', color: tag.colour }}
                className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              >
                {tag.name}
              </span>
            ) : null
          })}
        </div>
      )}
    </div>
  )
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
