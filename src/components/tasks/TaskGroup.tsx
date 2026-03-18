import { useState } from 'react'
import type { ExtendedTask } from '../../types/task.types'
import TaskItem from './TaskItem'

interface TaskGroupProps {
  label: string
  tasks: ExtendedTask[]
  defaultOpen?: boolean
}

export default function TaskGroup({ label, tasks, defaultOpen = true }: TaskGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const active = tasks.filter(t => t.status === 'needsAction')
  const completed = tasks.filter(t => t.status === 'completed')
  const [showCompleted, setShowCompleted] = useState(false)

  if (tasks.length === 0) return null

  return (
    <div className="mb-1">
      {/* Group header */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-slate-500 hover:text-slate-700 uppercase tracking-wide"
      >
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        {label}
        <span className="ml-auto font-normal normal-case tracking-normal text-slate-400">
          {active.length}
        </span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-0.5 px-2">
          {active.map(task => <TaskItem key={task.id} task={task} />)}

          {completed.length > 0 && (
            <>
              <button
                onClick={() => setShowCompleted(o => !o)}
                className="text-xs text-slate-400 hover:text-slate-600 px-1 py-0.5 text-left"
              >
                {showCompleted ? '▾' : '▸'} {completed.length} completed
              </button>
              {showCompleted && completed.map(task => <TaskItem key={task.id} task={task} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
