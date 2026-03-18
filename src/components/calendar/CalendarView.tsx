import { useState, useMemo } from 'react'
import {
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  format, startOfMonth,
} from 'date-fns'
import { useTasksStore } from '../../stores/tasks-store'
import { useCalendarStore } from '../../stores/calendar-store'
import MonthGrid from './MonthGrid'
import WeekView from './WeekView'
import DayView from './DayView'
import TaskEditorModal from '../tasks/TaskEditorModal'

type DisplayMode = 'month' | 'week' | 'day'

function formatHeader(date: Date, mode: DisplayMode): string {
  if (mode === 'month') return format(date, 'MMMM yyyy')
  if (mode === 'week') return `Week of ${format(date, 'MMM d, yyyy')}`
  return format(date, 'EEEE, MMMM d, yyyy')
}

function navigate(date: Date, mode: DisplayMode, dir: -1 | 1): Date {
  if (mode === 'month') return dir === 1 ? addMonths(date, 1) : subMonths(date, 1)
  if (mode === 'week') return dir === 1 ? addWeeks(date, 1) : subWeeks(date, 1)
  return dir === 1 ? addDays(date, 1) : subDays(date, 1)
}

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [displayMode, setDisplayMode] = useState<DisplayMode>('month')
  const { tasks } = useTasksStore()
  const { events, calendars, selectedCalendarIds, setSelectedCalendarIds } = useCalendarStore()
  const [showCalendarPicker, setShowCalendarPicker] = useState(false)

  const allTasks = useMemo(() => Object.values(tasks), [tasks])
  const allEvents = useMemo(() => Object.values(events), [events])

  // Empty selectedCalendarIds means all are selected
  const visibleEvents = selectedCalendarIds.length === 0
    ? allEvents
    : allEvents.filter(e => selectedCalendarIds.includes(e.calendarId))

  function handleCalendarToggle(calendarId: string) {
    const currentlyEffective = selectedCalendarIds.length === 0
      ? calendars.map(c => c.id)
      : selectedCalendarIds

    const next = currentlyEffective.includes(calendarId)
      ? currentlyEffective.filter(id => id !== calendarId)
      : [...currentlyEffective, calendarId]

    const newIds = next.length === calendars.length ? [] : next
    setSelectedCalendarIds(newIds)
  }

  function goToToday() { setCurrentDate(new Date()) }

  // For month grid, use first day of month
  const monthDate = displayMode === 'month' ? startOfMonth(currentDate) : currentDate

  return (
    <div className="flex flex-col h-full">
      {/* Subheader */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-200 bg-white flex-shrink-0">
        <button
          onClick={() => setCurrentDate(d => navigate(d, displayMode, -1))}
          className="text-slate-500 hover:text-slate-700 px-1"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-slate-700 flex-1 text-center">
          {formatHeader(currentDate, displayMode)}
        </span>
        <button
          onClick={() => setCurrentDate(d => navigate(d, displayMode, 1))}
          className="text-slate-500 hover:text-slate-700 px-1"
        >
          ›
        </button>
        <button
          onClick={goToToday}
          className="text-xs border border-slate-200 rounded px-2 py-0.5 text-slate-500 hover:bg-slate-50"
        >
          Today
        </button>

        {/* Display mode toggle */}
        <div className="flex border border-slate-200 rounded overflow-hidden">
          {(['month', 'week', 'day'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setDisplayMode(mode)}
              className={`text-xs px-2 py-0.5 transition-colors ${
                displayMode === mode
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {/* Calendar picker */}
        <div className="relative">
          <button
            onClick={() => setShowCalendarPicker(o => !o)}
            className="text-xs border border-slate-200 rounded px-2 py-0.5 text-slate-500 hover:bg-slate-50"
          >
            Calendars
          </button>
          {showCalendarPicker && (
            <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-10 min-w-40 p-2">
              {calendars.map(cal => {
                const effectiveIds = selectedCalendarIds.length === 0 ? calendars.map(c => c.id) : selectedCalendarIds
                const checked = effectiveIds.includes(cal.id)
                return (
                  <label key={cal.id} className="flex items-center gap-2 py-1 cursor-pointer text-xs text-slate-700 hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleCalendarToggle(cal.id)}
                      className="rounded"
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cal.backgroundColor ?? '#94a3b8' }}
                    />
                    {cal.summary}
                  </label>
                )
              })}
              {calendars.length === 0 && (
                <span className="text-xs text-slate-400">No calendars loaded</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Active view */}
      {displayMode === 'month' && (
        <MonthGrid month={monthDate} tasks={allTasks} events={visibleEvents} calendars={calendars} />
      )}
      {displayMode === 'week' && (
        <WeekView currentDate={currentDate} tasks={allTasks} events={visibleEvents} calendars={calendars} />
      )}
      {displayMode === 'day' && (
        <DayView currentDate={currentDate} tasks={allTasks} events={visibleEvents} calendars={calendars} />
      )}

      {/* Task editor modal */}
      <TaskEditorModal />
    </div>
  )
}
