import { useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useCalendarStore } from '../../stores/calendar-store'
import { useUIStore } from '../../stores/ui-store'
import { calendarApi } from '../../services/api/calendar-api'

export default function SettingsPanel() {
  const { settings, patch } = useSettingsStore()
  const { calendars, syncCalendars } = useCalendarStore()
  const { toggleSettings } = useUIStore()
  const [isCreatingCalendar, setIsCreatingCalendar] = useState(false)
  const [calendarError, setCalendarError] = useState<string | null>(null)

  // If defaultSchedulingCalendarId is set AND exists in the calendars list, we already have Taskboxing set up
  const hasSchedulingCalendar = !!(
    settings.defaultSchedulingCalendarId &&
    calendars.some(c => c.id === settings.defaultSchedulingCalendarId)
  )

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
