import { useState, useMemo } from 'react'
import { useTasksStore } from '../../stores/tasks-store'
import type { TaskDependency } from '../../types/task.types'

interface Props {
  currentTaskId: string
  dependencies: TaskDependency[]
  onChange: (deps: TaskDependency[]) => void
}

export default function DependencyPicker({ currentTaskId, dependencies, onChange }: Props) {
  const [query, setQuery] = useState('')
  const { tasks } = useTasksStore()

  const allTasks = useMemo(() => Object.values(tasks), [tasks])

  const matches = useMemo(() => {
    if (query.length < 2) return []
    const q = query.toLowerCase()
    return allTasks
      .filter(t =>
        t.id !== currentTaskId &&
        t.status === 'needsAction' &&
        t.title.toLowerCase().includes(q) &&
        !dependencies.some(d => d.taskId === t.id)
      )
      .slice(0, 8)
  }, [query, allTasks, currentTaskId, dependencies])

  function addDep(taskId: string) {
    onChange([...dependencies, { taskId, type: 'finish_to_start' }])
    setQuery('')
  }

  function removeDep(taskId: string) {
    onChange(dependencies.filter(d => d.taskId !== taskId))
  }

  return (
    <div>
      {/* Selected dependencies */}
      {dependencies.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {dependencies.map(dep => {
            const t = tasks[dep.taskId]
            return (
              <span
                key={dep.taskId}
                className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full"
              >
                {t?.title ?? dep.taskId}
                <button onClick={() => removeDep(dep.taskId)} className="text-slate-400 hover:text-red-500">✕</button>
              </span>
            )
          })}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search tasks to block on..."
          className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        {matches.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
            {matches.map(t => (
              <button
                key={t.id}
                onClick={() => addDep(t.id)}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t.title}
                <span className="ml-1 text-xs text-slate-400">{t.taskListId}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
