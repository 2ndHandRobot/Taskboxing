import { useState } from 'react'
import { format } from 'date-fns'
import type { ExtendedTask, ExtendedCalendarEvent, CalendarInfo } from '../../types/task.types'
import { useCompleteTask } from '../../hooks/useCompleteTask'
import { useUIStore } from '../../stores/ui-store'
import EventPopover from './EventPopover'
import { useCalendarStore } from '../../stores/calendar-store'
import { useCompleteEvent } from '../../hooks/useCompleteEvent'
import { useTasksStore } from '../../stores/tasks-store'

const MAX_VISIBLE = 3

interface Props {
  day: Date
  tasks: ExtendedTask[]
  events: ExtendedCalendarEvent[]
  calendars: CalendarInfo[]       // passed from MonthGrid for colour lookup
  isCurrentMonth: boolean
  isToday: boolean
}

export default function DayCell({ day, tasks, events, calendars, isCurrentMonth, isToday }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<ExtendedCalendarEvent | null>(null)
  const [showAll, setShowAll] = useState(false)
  const { completeTask, uncompleteTask } = useCompleteTask()
  const { openTaskEditor, setEditorInitialTask } = useUIStore()
  const { tasks: tasksRecord } = useTasksStore()
  const { isEventCompleted } = useCalendarStore()
  const { completeEvent, uncompleteEvent } = useCompleteEvent()

  function getEventColour(event: ExtendedCalendarEvent): string {
    const cal = calendars.find(c => c.id === event.calendarId)
    return cal?.backgroundColor ?? '#6366f1'
  }

  const allItems = [
    ...events.map(e => ({ type: 'event' as const, item: e })),
    ...tasks.map(t => ({ type: 'task' as const, item: t })),
  ]
  const visible = showAll ? allItems : allItems.slice(0, MAX_VISIBLE)
  const overflow = allItems.length - MAX_VISIBLE

  function handleTaskClick(task: ExtendedTask) {
    setEditorInitialTask(task)
    openTaskEditor(task.id)
  }

  function handleEmptyClick() {
    const dateStr = format(day, 'yyyy-MM-dd')
    setEditorInitialTask({ due: new Date(dateStr).toISOString() }, true)
    openTaskEditor()
  }

  return (
    <div
      onClick={handleEmptyClick}
      className={`border-r border-b border-slate-100 p-1 min-h-14 cursor-pointer hover:bg-slate-50 relative ${
        !isCurrentMonth ? 'bg-slate-50/50' : ''
      }`}
    >
      {/* Day number */}
      <div className={`text-xs w-5 h-5 flex items-center justify-center rounded-full mb-0.5 font-medium ${
        isToday ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-slate-700' : 'text-slate-400'
      }`}>
        {format(day, 'd')}
      </div>

      {/* Items */}
      <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
        {visible.map(({ type, item }) => {
          if (type === 'event') {
            const event = item as ExtendedCalendarEvent
            const isCompleted = isEventCompleted(event, tasksRecord)
            return (
              <div
                key={`e-${event.id}`}
                className="group flex items-center w-full text-xs rounded overflow-hidden"
                style={{ backgroundColor: isCompleted ? '#e2e8f0' : getEventColour(event) }}
              >
                <button
                  onClick={async e => {
                    e.stopPropagation()
                    if (isCompleted) await uncompleteEvent(event)
                    else await completeEvent(event)
                  }}
                  className="opacity-0 group-hover:opacity-100 w-3.5 h-3.5 flex-shrink-0 rounded-sm border flex items-center justify-center ml-0.5 transition-opacity"
                  style={{ borderColor: isCompleted ? '#94a3b8' : 'rgba(255,255,255,0.6)' }}
                >
                  {isCompleted && (
                    <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setSelectedEvent(event) }}
                  className="flex-1 text-left px-1 py-0.5 truncate font-medium"
                  style={{ color: isCompleted ? '#94a3b8' : 'white' }}
                >
                  <span className={isCompleted ? 'line-through' : ''}>{event.summary}</span>
                </button>
              </div>
            )
          } else {
            const task = item as ExtendedTask
            return (
              <div key={`t-${task.id}`} className="flex items-center gap-0.5">
                <button
                  onClick={async e => {
                    e.stopPropagation()
                    if (task.status === 'needsAction') await completeTask(task)
                    else await uncompleteTask(task)
                  }}
                  className="w-3 h-3 rounded-sm border border-slate-300 flex-shrink-0 flex items-center justify-center hover:border-blue-400"
                >
                  {task.status === 'completed' && (
                    <svg className="w-2 h-2 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleTaskClick(task) }}
                  className="flex-1 text-left text-xs truncate text-slate-600 hover:text-slate-900"
                >
                  {task.title}
                </button>
              </div>
            )
          }
        })}

        {!showAll && overflow > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setShowAll(true) }}
            className="text-xs text-blue-500 hover:text-blue-700 text-left px-1"
          >
            +{overflow} more
          </button>
        )}
      </div>

      {/* Event popover */}
      {selectedEvent && (
        <EventPopover event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  )
}
