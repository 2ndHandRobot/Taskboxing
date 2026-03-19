import { useState, useRef, useLayoutEffect } from 'react'
import { format, parseISO } from 'date-fns'
import type { ExtendedCalendarEvent } from '../../types/task.types'
import { useCalendarStore } from '../../stores/calendar-store'
import { useTasksStore } from '../../stores/tasks-store'
import { useCompleteEvent } from '../../hooks/useCompleteEvent'

const POPOVER_WIDTH = 224  // matches w-56
const MARGIN = 6           // gap between anchor and popover

interface Props {
  event: ExtendedCalendarEvent
  anchorRect?: DOMRect  // when provided, uses fixed viewport-aware positioning
  onClose: () => void
}

export default function EventPopover({ event, anchorRect, onClose }: Props) {
  const { tasks } = useTasksStore()
  const { isEventCompleted } = useCalendarStore()
  const { completeEvent, uncompleteEvent } = useCompleteEvent()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!anchorRect || !ref.current) return
    const popH = ref.current.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Horizontal: left-align to event, clamped to viewport
    let left = anchorRect.left
    if (left + POPOVER_WIDTH > vw - 8) left = vw - POPOVER_WIDTH - 8
    if (left < 8) left = 8

    // Vertical: above if there's room, else below
    let top: number
    if (anchorRect.top - MARGIN - popH >= 8) {
      top = anchorRect.top - MARGIN - popH
    } else {
      top = anchorRect.bottom + MARGIN
    }
    if (top + popH > vh - 8) top = vh - popH - 8
    if (top < 8) top = 8

    setPos({ top, left })
  }, [anchorRect])

  const completed = isEventCompleted(event, tasks)
  const linkedTask = event.linkedTaskId ? tasks[event.linkedTaskId] : null

  const startTime = event.start.dateTime
    ? format(parseISO(event.start.dateTime), 'h:mm a')
    : 'All day'
  const endTime = event.end.dateTime
    ? format(parseISO(event.end.dateTime), 'h:mm a')
    : null

  async function handleToggleComplete() {
    setIsSubmitting(true)
    try {
      if (completed) {
        await uncompleteEvent(event)
      } else {
        await completeEvent(event)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const isAnchored = !!anchorRect
  const anchoredStyle = isAnchored
    ? (pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' as const, top: 0, left: 0 })
    : undefined

  return (
    <div
      ref={ref}
      className={`${isAnchored ? 'fixed z-50' : 'absolute z-20'} bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-56 text-sm`}
      style={anchoredStyle}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex justify-between items-start mb-1">
        <span className={`font-medium leading-snug flex-1 ${completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {event.summary}
        </span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-1 text-xs">✕</button>
      </div>
      <div className="text-xs text-slate-500 mb-1">
        {startTime}{endTime ? ` – ${endTime}` : ''}
      </div>
      {event.description && (
        <p className="text-xs text-slate-600 mb-2 line-clamp-3">
          {event.description.replace(/\[taskboxing:[^\]]+\]/, '').trim()}
        </p>
      )}
      {linkedTask && (
        <div className="text-xs text-slate-500 mb-2 flex items-center gap-1 border-t border-slate-100 pt-1.5">
          <span className="text-slate-400">Task:</span>
          <span className={`flex-1 truncate ${linkedTask.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-600'}`}>
            {linkedTask.title}
          </span>
          {linkedTask.status === 'completed' && (
            <svg className="w-3 h-3 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-100">
        <button
          onClick={handleToggleComplete}
          disabled={isSubmitting}
          className={`text-xs px-2 py-1 rounded font-medium flex-1 disabled:opacity-50 ${
            completed
              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          }`}
        >
          {completed ? 'Mark incomplete' : '✓ Mark done'}
        </button>
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0"
          >
            Open ↗
          </a>
        )}
      </div>
    </div>
  )
}
