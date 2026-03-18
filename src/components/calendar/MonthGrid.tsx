import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
} from 'date-fns'
import type { ExtendedTask, ExtendedCalendarEvent, CalendarInfo } from '../../types/task.types'
import DayCell from './DayCell'

interface Props {
  month: Date
  tasks: ExtendedTask[]
  events: ExtendedCalendarEvent[]
  calendars: CalendarInfo[]
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function MonthGrid({ month, tasks, events, calendars }: Props) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start, end })

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-slate-200">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-xs text-slate-400 py-1 font-medium">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const dayTasks = tasks.filter(t => t.due?.startsWith(dateStr))
          const dayEvents = events.filter(e => {
            const eventDate = e.start.date ?? e.start.dateTime?.slice(0, 10)
            return eventDate === dateStr
          })

          return (
            <DayCell
              key={dateStr}
              day={day}
              tasks={dayTasks}
              events={dayEvents}
              calendars={calendars}
              isCurrentMonth={isSameMonth(day, month)}
              isToday={isToday(day)}
            />
          )
        })}
      </div>
    </div>
  )
}
