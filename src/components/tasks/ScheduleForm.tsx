import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import type { ExtendedTask, ExtendedCalendarEvent, CalendarEventTime } from '../../types/task.types'
import { useCalendarStore } from '../../stores/calendar-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useTasksStore } from '../../stores/tasks-store'
import { calendarApi } from '../../services/api/calendar-api'
import DayPreview from './DayPreview'

interface Props {
  task: ExtendedTask
  existingEvent?: ExtendedCalendarEvent | null  // null/undefined = new schedule
  onScheduled: () => void
  onCancel: () => void
}

export default function ScheduleForm({ task, existingEvent, onScheduled, onCancel }: Props) {
  const { calendars, createTaskEvent, addEvent, deleteEvent } = useCalendarStore()
  const { settings } = useSettingsStore()
  const { updateTask } = useTasksStore()

  // Resolve default calendar: user setting → primary calendar → first calendar
  const primaryCalendar = calendars.find(c => c.primary)
  const defaultCalId =
    settings.defaultSchedulingCalendarId ??
    primaryCalendar?.id ??
    calendars[0]?.id ??
    ''

  // Initialise from existing event or task defaults
  const initCalId = existingEvent?.calendarId ?? defaultCalId
  const initDate = existingEvent?.start.dateTime
    ? existingEvent.start.dateTime.slice(0, 10)
    : task.due?.slice(0, 10) ?? format(new Date(), 'yyyy-MM-dd')
  const initStart = existingEvent?.start.dateTime
    ? format(new Date(existingEvent.start.dateTime), 'HH:mm')
    : ''
  const initEnd = existingEvent?.end.dateTime
    ? format(new Date(existingEvent.end.dateTime), 'HH:mm')
    : ''

  const [calendarId, setCalendarId] = useState(initCalId)
  const [date, setDate] = useState(initDate)
  const [startTime, setStartTime] = useState(initStart)
  const [endTime, setEndTime] = useState(initEnd)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-compute end time when startTime is set and endTime is empty (new events only).
  // Deps intentionally omit existingEvent/endTime/estimatedMinutes to avoid overwriting
  // user edits — only re-runs when startTime changes.
  useEffect(() => {
    if (!existingEvent && startTime && !endTime) {
      const [h, m] = startTime.split(':').map(Number)
      const totalMins = h * 60 + m + (task.metadata.estimatedMinutes ?? 60)
      const eh = Math.floor(totalMins / 60) % 24
      const em = totalMins % 60
      setEndTime(`${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`)
    }
  }, [startTime]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update to default calendar once calendars are loaded.
  // Intentionally omit settings/calendarId from deps to avoid overwriting the user's selection.
  useEffect(() => {
    if (!calendarId && calendars.length > 0) {
      setCalendarId(
        settings.defaultSchedulingCalendarId ??
        calendars.find(c => c.primary)?.id ??
        calendars[0].id
      )
    }
  }, [calendars]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!startTime) return
    setIsSaving(true)
    setError(null)
    try {
      // Auto-populate endTime with startTime + 60min if it's missing
      const resolvedEnd = endTime || (() => {
        const [h, m] = startTime.split(':').map(Number)
        const total = h * 60 + m + 60
        return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
      })()

      const start: CalendarEventTime = {
        dateTime: new Date(`${date}T${startTime}:00`).toISOString(),
      }
      const end: CalendarEventTime = {
        dateTime: new Date(`${date}T${resolvedEnd}:00`).toISOString(),
      }

      let savedEvent: ExtendedCalendarEvent

      if (existingEvent) {
        if (calendarId !== existingEvent.calendarId) {
          // Calendar changed: create new event first, so original is not lost if creation fails
          savedEvent = await createTaskEvent(calendarId, task.id, task.taskListId, task.title, start, end)
          // Only delete old event after new one is confirmed created
          await deleteEvent(existingEvent.calendarId, existingEvent.id)
        } else {
          // Same calendar: patch start/end only
          const patched = await calendarApi.patchEvent(calendarId, existingEvent.id, { start, end })
          await addEvent(patched)
          savedEvent = patched
        }
      } else {
        savedEvent = await createTaskEvent(calendarId, task.id, task.taskListId, task.title, start, end)
      }

      // Save calendarEventId + calendarId into task metadata
      await updateTask({
        ...task,
        metadata: {
          ...task.metadata,
          calendarEventId: savedEvent.id,
          calendarId: savedEvent.calendarId,
        },
      })

      onScheduled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {/* Form row */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <select
          value={calendarId}
          onChange={e => setCalendarId(e.target.value)}
          aria-label="Calendar"
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-full"
        >
          {calendars.map(cal => (
            <option key={cal.id} value={cal.id}>{cal.summary}</option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          aria-label="Date"
          className="text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <input
          type="time"
          value={startTime}
          onChange={e => setStartTime(e.target.value)}
          aria-label="Start time"
          className="text-xs border border-slate-200 rounded px-1.5 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <span className="text-xs text-slate-400">→</span>
        <input
          type="time"
          value={endTime}
          onChange={e => setEndTime(e.target.value)}
          aria-label="End time"
          className="text-xs border border-slate-200 rounded px-1.5 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={handleSubmit}
          disabled={!startTime || isSaving}
          className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? '…' : existingEvent ? 'Update' : 'Schedule'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Day preview */}
      {date && (
        <DayPreview date={date} excludeEventId={existingEvent?.id} />
      )}
    </div>
  )
}
