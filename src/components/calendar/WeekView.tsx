import { useState } from 'react'
import { format, addDays, startOfWeek, isSameDay, isToday } from 'date-fns'
import type { ExtendedTask, ExtendedCalendarEvent, CalendarInfo } from '../../types/task.types'
import { useCompleteTask } from '../../hooks/useCompleteTask'
import { useUIStore } from '../../stores/ui-store'
import { useCalendarStore } from '../../stores/calendar-store'
import { useCompleteEvent } from '../../hooks/useCompleteEvent'
import { useTasksStore } from '../../stores/tasks-store'
import EventPopover from './EventPopover'

interface Props {
  currentDate: Date
  tasks: ExtendedTask[]
  events: ExtendedCalendarEvent[]
  calendars: CalendarInfo[]
}

export default function WeekView({ currentDate, tasks, events, calendars }: Props) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  type PopoverState = { event: ExtendedCalendarEvent; rect: DOMRect } | null
  const [popover, setPopover] = useState<PopoverState>(null)

  const { completeTask, uncompleteTask } = useCompleteTask()
  const { openTaskEditor, setEditorInitialTask } = useUIStore()
  const { tasks: tasksRecord } = useTasksStore() // aliased to avoid collision with tasks prop
  const { isEventCompleted } = useCalendarStore()
  const { completeEvent, uncompleteEvent } = useCompleteEvent()

  function getEventColour(event: ExtendedCalendarEvent): string {
    const cal = calendars.find(c => c.id === event.calendarId)
    return cal?.backgroundColor ?? '#6366f1'
  }

  function handleTaskClick(task: ExtendedTask) {
    setEditorInitialTask(task)
    openTaskEditor(task.id)
  }

  function handleDayClick(day: Date) {
    const dateStr = format(day, 'yyyy-MM-dd')
    setEditorInitialTask({ due: new Date(dateStr).toISOString() }, true)
    openTaskEditor()
  }

  return (
    <div className="relative flex flex-col flex-1 overflow-y-auto">
      {days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const dayTasks = tasks.filter(t => t.due?.startsWith(dateStr))
        const dayEvents = events.filter(e => {
          const eventDate = e.start.date ?? e.start.dateTime?.slice(0, 10)
          return eventDate === dateStr
        })
        const today = isToday(day)

        return (
          <div key={dateStr} className="border-b border-slate-100">
            {/* Day header */}
            <div
              onClick={() => handleDayClick(day)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border-b border-slate-100 cursor-pointer hover:bg-slate-50"
            >
              <div className={`text-xs font-semibold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                today ? 'bg-blue-600 text-white' : 'text-slate-500'
              }`}>
                {format(day, 'd')}
              </div>
              <span className={`text-xs font-medium ${today ? 'text-blue-600' : 'text-slate-500'}`}>
                {format(day, 'EEEE')}
              </span>
              {(dayTasks.length + dayEvents.length) === 0 && (
                <span className="text-xs text-slate-300 ml-auto">+ add task</span>
              )}
            </div>

            {/* Events and tasks */}
            {(dayTasks.length > 0 || dayEvents.length > 0) && (
              <div className="px-3 py-1 flex flex-col gap-0.5">
                {dayEvents.map(event => {
                  const isCompleted = isEventCompleted(event, tasksRecord)
                  return (
                    <div
                      key={event.id}
                      className="group flex items-center gap-1 text-xs px-1 py-1 rounded font-medium"
                      style={{ backgroundColor: isCompleted ? '#e2e8f0' : getEventColour(event) }}
                    >
                      <button
                        aria-label={isCompleted ? 'Mark event incomplete' : 'Mark event complete'}
                        onClick={async e => {
                          e.stopPropagation()
                          if (isCompleted) await uncompleteEvent(event)
                          else await completeEvent(event)
                        }}
                        className="opacity-0 group-hover:opacity-100 w-3.5 h-3.5 flex-shrink-0 rounded-sm border flex items-center justify-center transition-opacity"
                        style={{ borderColor: isCompleted ? '#94a3b8' : 'rgba(255,255,255,0.6)' }}
                      >
                        {isCompleted && (
                          <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                      {event.start.dateTime && (
                        <span className="opacity-80 flex-shrink-0" style={{ color: isCompleted ? '#94a3b8' : 'white' }}>
                          {format(new Date(event.start.dateTime), 'HH:mm')}
                        </span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setPopover({ event, rect: e.currentTarget.getBoundingClientRect() }) }}
                        className={`truncate text-left flex-1 ${isCompleted ? 'line-through' : ''}`}
                        style={{ color: isCompleted ? '#94a3b8' : 'white' }}
                      >
                        {event.summary}
                      </button>
                    </div>
                  )
                })}
                {dayTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-1.5">
                    <button
                      onClick={async e => {
                        e.stopPropagation()
                        if (task.status === 'needsAction') await completeTask(task)
                        else await uncompleteTask(task)
                      }}
                      className="w-3.5 h-3.5 rounded border border-slate-300 flex-shrink-0 flex items-center justify-center hover:border-blue-400"
                    >
                      {task.status === 'completed' && (
                        <svg className="w-2.5 h-2.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => handleTaskClick(task)}
                      className={`flex-1 text-left text-xs truncate ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700 hover:text-slate-900'}`}
                    >
                      {task.title}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {popover && (
        <EventPopover event={popover.event} anchorRect={popover.rect} onClose={() => setPopover(null)} />
      )}
    </div>
  )
}
