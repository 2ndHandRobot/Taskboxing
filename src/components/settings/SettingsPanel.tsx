import { useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useCalendarStore } from '../../stores/calendar-store'
import { useUIStore } from '../../stores/ui-store'
import { useAuthStore } from '../../stores/auth-store'
import { calendarApi } from '../../services/api/calendar-api'
import { useTasksStore } from '../../stores/tasks-store'

function getInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function SettingsPanel() {
  const { settings, patch } = useSettingsStore()
  const { calendars, syncCalendars } = useCalendarStore()
  const { taskLists } = useTasksStore()
  const { toggleSettings } = useUIStore()
  const { user, logout } = useAuthStore()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState(false)
  const [isCreatingCalendar, setIsCreatingCalendar] = useState(false)
  const [calendarError, setCalendarError] = useState<string | null>(null)

  // If defaultSchedulingCalendarId is set AND exists in the calendars list, we already have Taskboxing set up
  const hasSchedulingCalendar = !!(
    settings.defaultSchedulingCalendarId &&
    calendars.some(c => c.id === settings.defaultSchedulingCalendarId)
  )

  async function handleSignOut() {
    setIsSigningOut(true)
    setSignOutError(null)
    try {
      await logout()
      toggleSettings()
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : 'Sign out failed')
    } finally {
      setIsSigningOut(false)
    }
  }

  async function handleCreateTaskboxing() {
    setIsCreatingCalendar(true)
    setCalendarError(null)
    try {
      const cal = await calendarApi.createCalendar({
        summary: 'Taskboxing',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (!cal.id) throw new Error('Calendar created but returned no ID — please refresh and try again')
      await patch({ defaultSchedulingCalendarId: cal.id })
      try {
        await syncCalendars()
      } catch {
        // Setting was saved — calendar list will refresh on next open
        setCalendarError('Taskboxing calendar created, but calendar list failed to refresh. Reopen settings to see it.')
        return
      }
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to create calendar')
    } finally {
      setIsCreatingCalendar(false)
    }
  }

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-700">Settings</h2>
        <button
          onClick={toggleSettings}
          aria-label="Close settings"
          className="text-slate-400 hover:text-slate-600 text-lg leading-none"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">
        {/* Account */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Account</h3>
          <div className="flex items-center gap-3">
            {/* Avatar — img shown only when picture URL is present and hasn't errored */}
            {user?.picture && !avatarError ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-8 h-8 rounded-full flex-shrink-0"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">
                {user ? getInitials(user.name) : '?'}
              </div>
            )}

            {/* Name / email */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 flex-shrink-0"
            >
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>

          {signOutError && (
            <p className="text-xs text-red-600">{signOutError}</p>
          )}
        </section>

        {/* Scheduling */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Scheduling</h3>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Default calendar</label>
              {calendars.length === 0 ? (
                <span className="text-xs text-slate-400 italic">Loading calendars…</span>
              ) : (
                <select
                  value={settings.defaultSchedulingCalendarId ?? ''}
                  onChange={e => patch({ defaultSchedulingCalendarId: e.target.value || undefined }).catch(console.error)}
                  className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">— Primary calendar —</option>
                  {calendars.map(cal => (
                    <option key={cal.id} value={cal.id}>{cal.summary}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Default task list for new tasks</label>
              {taskLists.length === 0 ? (
                <span className="text-xs text-slate-400 italic">Loading lists…</span>
              ) : (
                <select
                  value={settings.defaultTaskListId ?? ''}
                  onChange={e => patch({ defaultTaskListId: e.target.value || undefined }).catch(console.error)}
                  className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">— No default —</option>
                  {taskLists.map(list => (
                    <option key={list.id} value={list.id}>{list.title}</option>
                  ))}
                </select>
              )}
            </div>

            {!hasSchedulingCalendar && (
              <div>
                {calendarError && (
                  <p className="text-xs text-red-500 mb-1">{calendarError}</p>
                )}
                <button
                  onClick={handleCreateTaskboxing}
                  disabled={isCreatingCalendar}
                  className="text-xs px-3 py-1.5 border border-dashed border-blue-300 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingCalendar ? 'Creating…' : '+ Create Taskboxing calendar'}
                </button>
              </div>
            )}

            {hasSchedulingCalendar && (
              <p className="text-xs text-green-600">
                ✓ Taskboxing calendar ready
              </p>
            )}
          </div>
        </div>

        {/* Tags placeholder */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Tags</h3>
          {settings.tags.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No tags yet. Add tags in the task editor.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {settings.tags.map(tag => (
                <span
                  key={tag.id}
                  style={{ backgroundColor: tag.colour + '20', color: tag.colour, borderColor: tag.colour }}
                  className="text-xs px-2 py-0.5 rounded-full border font-medium"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
