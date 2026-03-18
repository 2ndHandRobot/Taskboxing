import type { TimeConstraint } from '../../types/task.types'

interface Props {
  value: TimeConstraint
  onChange: (value: TimeConstraint) => void
}

type ConstraintType = TimeConstraint['type']

const OPTIONS: { value: ConstraintType; label: string; group: string }[] = [
  { value: 'anytime', label: 'Anytime', group: 'No constraint' },
  { value: 'work_hours_only', label: 'Work hours only', group: 'Work hours' },
  { value: 'before_work', label: 'Before work', group: 'Work hours' },
  { value: 'after_work', label: 'After work', group: 'Work hours' },
  { value: 'not_during_work', label: 'Not during work', group: 'Work hours' },
  { value: 'fixed_time', label: 'Fixed time', group: 'Specific time' },
  { value: 'time_window', label: 'Time window', group: 'Specific time' },
  { value: 'before_time', label: 'Before time', group: 'Specific time' },
  { value: 'after_time', label: 'After time', group: 'Specific time' },
]

const GROUPS = ['No constraint', 'Work hours', 'Specific time']

export default function TimeConstraintSelector({ value, onChange }: Props) {
  function handleTypeChange(type: ConstraintType) {
    switch (type) {
      case 'anytime':
      case 'work_hours_only':
      case 'before_work':
      case 'after_work':
      case 'not_during_work':
        onChange({ type })
        break
      case 'fixed_time':
        onChange({ type, time: '' })
        break
      case 'time_window':
        onChange({ type, start: '', end: '' })
        break
      case 'before_time':
      case 'after_time':
        onChange({ type, time: '' })
        break
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={value.type}
        onChange={e => handleTypeChange(e.target.value as ConstraintType)}
        className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        {GROUPS.map(group => (
          <optgroup key={group} label={group}>
            {OPTIONS.filter(o => o.group === group).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Conditional secondary inputs */}
      {value.type === 'fixed_time' && (
        <input
          type="datetime-local"
          value={value.time}
          onChange={e => onChange({ type: 'fixed_time', time: e.target.value })}
          className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      )}

      {value.type === 'time_window' && (
        <div className="flex gap-1.5">
          <input
            type="datetime-local"
            value={value.start}
            onChange={e => onChange({ type: 'time_window', start: e.target.value, end: (value as { type: 'time_window'; start: string; end: string }).end })}
            placeholder="Start"
            className="flex-1 text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <input
            type="datetime-local"
            value={value.end}
            onChange={e => onChange({ type: 'time_window', start: (value as { type: 'time_window'; start: string; end: string }).start, end: e.target.value })}
            placeholder="End"
            className="flex-1 text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      )}

      {(value.type === 'before_time' || value.type === 'after_time') && (
        <input
          type="time"
          value={value.time}
          onChange={e => onChange({ type: value.type as 'before_time' | 'after_time', time: e.target.value })}
          className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      )}
    </div>
  )
}
