import { useMemo } from 'react'
import { format } from 'date-fns'
import { useCalendarStore } from '../../stores/calendar-store'

interface Props {
  date: string             // YYYY-MM-DD
  excludeEventId?: string  // skip this event (being rescheduled)
}

export default function DayPreview({ date, excludeEventId }: Props) {
  const { events, calendars } = useCalendarStore()

  const dayEvents = useMemo(() => {
    return Object.values(events)
      .filter(e => {
        if (e.id === excludeEventId) return false
        const d = e.start.date ?? e.start.dateTime?.slice(0, 10)
        return d === date
      })
      .sort((a, b) => {
        const aT = a.start.dateTime ?? a.start.date ?? ''
        const bT = b.start.dateTime ?? b.start.date ?? ''
        return aT.localeCompare(bT)
      })
  }, [date, events, excludeEventId])

  if (dayEvents.length === 0) {
    return <p className="text-xs text-slate-400 italic">No events on this day</p>
  }

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <p className="text-xs text-slate-400 px-2 py-1 bg-slate-50 border-b border-slate-100 font-medium">
        {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''} on this day
      </p>
      <div className="max-h-28 overflow-y-auto divide-y divide-slate-50">
        {dayEvents.map(event => {
          const cal = calendars.find(c => c.id === event.calendarId)
          const colour = cal?.backgroundColor ?? '#6366f1'
          const timeStr = event.start.dateTime
            ? format(new Date(event.start.dateTime), 'HH:mm')
            : 'All day'
          const endStr = event.end.dateTime
            ? format(new Date(event.end.dateTime), 'HH:mm')
            : null
          return (
            <div key={event.id} className="flex items-center gap-1.5 px-2 py-1">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colour }} />
              <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">
                {timeStr}{endStr ? `–${endStr}` : ''}
              </span>
              <span className="text-xs text-slate-700 truncate">{event.summary}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
