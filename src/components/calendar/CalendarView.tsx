import { useState, useMemo } from 'react'
import { addMonths, subMonths, format } from 'date-fns'
import { useTasksStore } from '../../stores/tasks-store'
import { useCalendarStore } from '../../stores/calendar-store'
import MonthGrid from './MonthGrid'
import TaskEditorModal from '../tasks/TaskEditorModal'

export default function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
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
    // Interpret [] as all-selected. Toggling off: add others except this one.
    const currentlyEffective = selectedCalendarIds.length === 0
      ? calendars.map(c => c.id)
      : selectedCalendarIds

    const next = currentlyEffective.includes(calendarId)
      ? currentlyEffective.filter(id => id !== calendarId)
      : [...currentlyEffective, calendarId]

    // If all are selected, go back to [] (all)
    const newIds = next.length === calendars.length ? [] : next
    setSelectedCalendarIds(newIds)
  }

  function goToToday() { setCurrentMonth(new Date()) }

  return (
    <div className="flex flex-col h-full">
      {/* Subheader */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-200 bg-white flex-shrink-0">
        <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="text-slate-500 hover:text-slate-700 px-1">‹</button>
        <span className="text-sm font-medium text-slate-700 flex-1 text-center">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="text-slate-500 hover:text-slate-700 px-1">›</button>
        <button onClick={goToToday} className="text-xs border border-slate-200 rounded px-2 py-0.5 text-slate-500 hover:bg-slate-50">
          Today
        </button>

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

      {/* Month grid */}
      <MonthGrid month={currentMonth} tasks={allTasks} events={visibleEvents} calendars={calendars} />

      {/* Task editor modal (for clicking task chips) */}
      <TaskEditorModal />
    </div>
  )
}
