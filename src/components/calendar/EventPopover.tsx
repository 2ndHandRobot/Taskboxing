import { format, parseISO } from 'date-fns'
import type { ExtendedCalendarEvent } from '../../types/task.types'

interface Props {
  event: ExtendedCalendarEvent
  onClose: () => void
}

export default function EventPopover({ event, onClose }: Props) {
  const startTime = event.start.dateTime
    ? format(parseISO(event.start.dateTime), 'h:mm a')
    : 'All day'
  const endTime = event.end.dateTime
    ? format(parseISO(event.end.dateTime), 'h:mm a')
    : null

  return (
    <div className="absolute z-20 bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-56 text-sm" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between items-start mb-1">
        <span className="font-medium text-slate-800 leading-snug flex-1">{event.summary}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-1 text-xs">✕</button>
      </div>
      <div className="text-xs text-slate-500 mb-1">
        {startTime}{endTime ? ` – ${endTime}` : ''}
      </div>
      {event.description && (
        <p className="text-xs text-slate-600 mb-2 line-clamp-3">{event.description.replace(/\[task-boxer:[^\]]+\]/, '').trim()}</p>
      )}
      {event.htmlLink && (
        <a
          href={event.htmlLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          Edit in Google Calendar ↗
        </a>
      )}
    </div>
  )
}
