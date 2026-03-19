import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { format } from 'date-fns'
import type { ExtendedTask, ExtendedCalendarEvent, CalendarEventTime } from '../../types/task.types'
import { useCalendarStore } from '../../stores/calendar-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useTasksStore } from '../../stores/tasks-store'
import { calendarApi } from '../../services/api/calendar-api'
import DayPreview from './DayPreview'

export interface ScheduleTaskInit {
  title: string
  due?: string
  metadata: { estimatedMinutes?: number }
}

interface Props {
  task: ExtendedTask | ScheduleTaskInit   // was: task: ExtendedTask
  existingEvent?: ExtendedCalendarEvent | null  // null/undefined = new schedule
  onCancel: () => void
}

export interface ScheduleFormHandle {
  submit: (taskOverride?: ExtendedTask) => Promise<void>  // was: submit: () => Promise<void>
}

function isExtendedTask(task: ExtendedTask | ScheduleTaskInit): task is ExtendedTask {
  return 'id' in task
}

const ScheduleForm = forwardRef<ScheduleFormHandle, Props>(function ScheduleForm(
  { task, existingEvent, onCancel },
  ref,
) {
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

  // Duration to preserve when start time is shifted
  const durationMins = existingEvent?.start.dateTime && existingEvent?.end.dateTime
    ? (new Date(existingEvent.end.dateTime).getTime() - new Date(existingEvent.start.dateTime).getTime()) / 60000
    : (task.metadata.estimatedMinutes ?? 60)

  const [calendarId, setCalendarId] = useState(initCalId)
  const [date, setDate] = useState(initDate)
  const [startTime, setStartTime] = useState(initStart)
  const [endTime, setEndTime] = useState(initEnd)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Skip on mount; whenever start changes, shift end by same duration
  const isMountRef = useRef(true)
  useEffect(() => {
    if (isMountRef.current) { isMountRef.current = false; return }
    if (!startTime) return
    const [h, m] = startTime.split(':').map(Number)
    const totalMins = h * 60 + m + durationMins
    const eh = Math.floor(totalMins / 60) % 24
    const em = totalMins % 60
    setEndTime(`${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`)
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

  async function handleSubmit(taskOverride?: ExtendedTask) {
    const taskForApi = taskOverride ?? task

    // Guard: ScheduleTaskInit has no 'id'. Bail if called without a real task.
    if (!isExtendedTask(taskForApi)) {
      setError('Cannot schedule: task must be saved first')
      return
    }

    if (!startTime) {
      setError('Start time is required to schedule on calendar')
      throw new Error('Start time is required')
    }
    setIsSaving(true)
    setError(null)
    try {
      // Auto-populate endTime with startTime + duration if missing
      const resolvedEnd = endTime || (() => {
        const [h, m] = startTime.split(':').map(Number)
        const total = h * 60 + m + durationMins
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
          savedEvent = await createTaskEvent(calendarId, taskForApi.id, taskForApi.taskListId, taskForApi.title, start, end)
          // Only delete old event after new one is confirmed created
          await deleteEvent(existingEvent.calendarId, existingEvent.id)
        } else {
          // Same calendar: patch start/end only
          const patched = await calendarApi.patchEvent(calendarId, existingEvent.id, { start, end })
          await addEvent(patched)
          savedEvent = patched
        }
      } else {
        savedEvent = await createTaskEvent(calendarId, taskForApi.id, taskForApi.taskListId, taskForApi.title, start, end)
      }

      // Save calendarEventId + calendarId into task metadata
      await updateTask({
        ...taskForApi,
        metadata: {
          ...taskForApi.metadata,
          calendarEventId: savedEvent.id,
          calendarId: savedEvent.calendarId,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to schedule'
      setError(msg)
      throw new Error(msg)
    } finally {
      setIsSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({ submit: handleSubmit }))

  function handleCancel() {
    setCalendarId(initCalId)
    setDate(initDate)
    setStartTime(initStart)
    setEndTime(initEnd)
    setError(null)
    onCancel()
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {/* Row 1: calendar, date */}
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
        <button
          onClick={handleCancel}
          className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
      {/* Row 2: time range */}
      <div className="flex gap-1.5 items-center">
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
        {isSaving && <span className="text-xs text-slate-400">Saving…</span>}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Day preview */}
      {date && (
        <DayPreview date={date} excludeEventId={existingEvent?.id} />
      )}
    </div>
  )
})

export default ScheduleForm
