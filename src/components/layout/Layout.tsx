import { useEffect, useState } from 'react'
import SideRail from './SideRail'
import { useUIStore } from '../../stores/ui-store'
import { useTasksStore } from '../../stores/tasks-store'
import { useCalendarStore } from '../../stores/calendar-store'
import { useSettingsStore } from '../../stores/settings-store'

// Views (placeholders for not-yet-built views)
import ListView from '../tasks/ListView'
import CalendarView from '../calendar/CalendarView'

function PlaceholderView({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
      {name} — coming in a future update
    </div>
  )
}

export default function Layout() {
  const { activeView, syncError, setSyncError } = useUIStore()
  const tasksStore = useTasksStore()
  const calendarStore = useCalendarStore()
  const settingsStore = useSettingsStore()
  const [isSyncing, setIsSyncing] = useState(false)

  // Mount sequence
  useEffect(() => {
    async function init() {
      setIsSyncing(true)
      await settingsStore.load()
      await Promise.all([
        tasksStore.loadFromCache(),
        calendarStore.loadFromCache(),
      ])
      await Promise.all([
        tasksStore.syncTaskLists().then(() => tasksStore.syncAllTasks()),
        calendarStore.syncCalendars().then(() => calendarStore.syncAllEvents()),
      ])
      setIsSyncing(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Error propagation
  useEffect(() => {
    const err = tasksStore.error ?? calendarStore.error ?? null
    setSyncError(err)
  }, [tasksStore.error, calendarStore.error, setSyncError])

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <SideRail syncError={syncError} isSyncing={isSyncing} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Sync error banner */}
        {syncError && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
            <span className="flex-1">{syncError}</span>
            <button
              onClick={() => setSyncError(null)}
              className="text-red-500 hover:text-red-700 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Active view */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'list' && <ListView />}
          {activeView === 'calendar' && <CalendarView />}
          {activeView === 'timeline' && <PlaceholderView name="Timeline" />}
          {activeView === 'dashboard' && <PlaceholderView name="Dashboard" />}
        </div>
      </div>
    </div>
  )
}
