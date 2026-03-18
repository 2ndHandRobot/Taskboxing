import { format, isToday } from 'date-fns'
import type { ExtendedTask, ExtendedCalendarEvent, CalendarInfo } from '../../types/task.types'
import { useCompleteTask } from '../../hooks/useCompleteTask'
import { useUIStore } from '../../stores/ui-store'

interface Props {
  currentDate: Date
  tasks: ExtendedTask[]
  events: ExtendedCalendarEvent[]
  calendars: CalendarInfo[]
}

export default function DayView({ currentDate, tasks, events, calendars }: Props) {
  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const dayTasks = tasks.filter(t => t.due?.startsWith(dateStr))
  const dayEvents = events.filter(e => {
    const eventDate = e.start.date ?? e.start.dateTime?.slice(0, 10)
    return eventDate === dateStr
  })

  const { completeTask, uncompleteTask } = useCompleteTask()
  const { openTaskEditor, setEditorInitialTask } = useUIStore()

  function getEventColour(event: ExtendedCalendarEvent): string {
    const cal = calendars.find(c => c.id === event.calendarId)
    return cal?.backgroundColor ?? '#6366f1'
  }

  function handleTaskClick(task: ExtendedTask) {
    setEditorInitialTask(task)
    openTaskEditor(task.id)
  }

  function handleNewTask() {
    setEditorInitialTask({ due: new Date(dateStr).toISOString() }, true)
    openTaskEditor()
  }

  const today = isToday(currentDate)

  return (
    <div className="flex flex-col flex-1 overflow-y-auto px-4 py-3 gap-3">
      {/* Events */}
      {dayEvents.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1.5">Events</p>
          <div className="flex flex-col gap-1">
            {dayEvents.map(event => (
              <div
                key={event.id}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-md text-white font-medium"
                style={{ backgroundColor: getEventColour(event) }}
              >
                {event.start.dateTime && (
                  <span className="opacity-80 text-xs flex-shrink-0">
                    {format(new Date(event.start.dateTime), 'HH:mm')}
                    {event.end.dateTime && ` – ${format(new Date(event.end.dateTime), 'HH:mm')}`}
                  </span>
                )}
                <span className="truncate">{event.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1.5">Tasks</p>
        {dayTasks.length === 0 ? (
          <button
            onClick={handleNewTask}
            className="text-xs text-slate-400 hover:text-blue-500 italic"
          >
            No tasks due — click to add one
          </button>
        ) : (
          <div className="flex flex-col gap-1">
            {dayTasks.map(task => (
              <div key={task.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-3 py-2">
                <button
                  onClick={async e => {
                    e.stopPropagation()
                    if (task.status === 'needsAction') await completeTask(task)
                    else await uncompleteTask(task)
                  }}
                  className="w-4 h-4 rounded border border-slate-300 flex-shrink-0 flex items-center justify-center hover:border-blue-400"
                >
                  {task.status === 'completed' && (
                    <svg className="w-3 h-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => handleTaskClick(task)}
                  className={`flex-1 text-left text-sm ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700 hover:text-slate-900'}`}
                >
                  {task.title}
                </button>
              </div>
            ))}
            <button onClick={handleNewTask} className="text-xs text-blue-500 hover:text-blue-700 text-left mt-1">
              + Add task
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
