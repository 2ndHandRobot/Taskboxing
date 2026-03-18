import { useMemo } from 'react'
import {
  startOfToday, startOfTomorrow, startOfDay, addDays,
  parseISO, isAfter, isBefore, endOfWeek
} from 'date-fns'
import { useTasksStore } from '../../stores/tasks-store'
import { useUIStore } from '../../stores/ui-store'
import type { ExtendedTask } from '../../types/task.types'
import TaskGroup from './TaskGroup'
import TaskEditorModal from './TaskEditorModal'

type Group = { label: string; tasks: ExtendedTask[] }

function groupByDue(tasks: ExtendedTask[]): Group[] {
  const now = startOfToday()
  const tomorrow = startOfTomorrow()
  const weekEnd = endOfWeek(addDays(now, 7), { weekStartsOn: 1 })

  const groups: Group[] = [
    { label: 'Overdue', tasks: [] },
    { label: 'Today', tasks: [] },
    { label: 'Tomorrow', tasks: [] },
    { label: 'This week', tasks: [] },
    { label: 'Later', tasks: [] },
    { label: 'No date', tasks: [] },
  ]

  for (const task of tasks) {
    if (!task.due) { groups[5].tasks.push(task); continue }
    const due = startOfDay(parseISO(task.due))
    if (isBefore(due, now)) groups[0].tasks.push(task)
    else if (due.getTime() === now.getTime()) groups[1].tasks.push(task)
    else if (due.getTime() === tomorrow.getTime()) groups[2].tasks.push(task)
    else if (isAfter(due, tomorrow) && isBefore(due, weekEnd)) groups[3].tasks.push(task)
    else if (isAfter(due, weekEnd)) groups[4].tasks.push(task)
    else groups[5].tasks.push(task)
  }

  return groups.filter(g => g.tasks.length > 0)
}

export default function ListView() {
  const { tasks, taskLists, isLoading } = useTasksStore()
  const {
    activeTaskListFilter, taskFilter, taskSort,
    setActiveTaskListFilter, setTaskFilter, setTaskSort,
    openTaskEditor,
  } = useUIStore()

  const allTasks = useMemo(() => Object.values(tasks), [tasks])

  const visibleTasks = useMemo(() => {
    let filtered = activeTaskListFilter
      ? allTasks.filter(t => t.taskListId === activeTaskListFilter)
      : allTasks

    if (taskFilter === 'active') filtered = filtered.filter(t => t.status === 'needsAction')
    else if (taskFilter === 'completed') filtered = filtered.filter(t => t.status === 'completed')

    return filtered
  }, [allTasks, activeTaskListFilter, taskFilter])

  const groups = useMemo(() => groupByDue(visibleTasks), [visibleTasks])

  return (
    <div className="flex flex-col h-full">
      {/* Subheader */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap">
        {/* Task list selector */}
        <select
          value={activeTaskListFilter ?? ''}
          onChange={e => setActiveTaskListFilter(e.target.value || null)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white text-slate-700 flex-shrink-0"
        >
          <option value="">All lists</option>
          {taskLists.map(list => (
            <option key={list.id} value={list.id}>{list.title}</option>
          ))}
        </select>

        {/* Filter chips */}
        <div className="flex gap-0.5">
          {(['all', 'active', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setTaskFilter(f)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                taskFilter === f
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={taskSort}
          onChange={e => setTaskSort(e.target.value as typeof taskSort)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none bg-white text-slate-500 ml-auto"
        >
          <option value="due">By due date</option>
          <option value="priority">By priority</option>
          <option value="manual">Manual</option>
        </select>

        {/* New task button */}
        <button
          onClick={() => openTaskEditor()}
          className="text-xs px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 flex-shrink-0"
        >
          + New
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading && groups.length === 0 && (
          <div className="flex items-center justify-center h-24 text-sm text-slate-400">
            Loading tasks...
          </div>
        )}
        {!isLoading && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <p className="text-sm text-slate-400">No tasks</p>
            <button
              onClick={() => openTaskEditor()}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              + Add your first task
            </button>
          </div>
        )}
        {groups.map((group, i) => (
          <TaskGroup
            key={group.label}
            label={group.label}
            tasks={group.tasks}
            defaultOpen={i < 3}
          />
        ))}
      </div>

      {/* Modal */}
      <TaskEditorModal />
    </div>
  )
}
