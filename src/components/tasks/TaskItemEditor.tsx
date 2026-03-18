import type { ExtendedTask } from '../../types/task.types'

interface Props {
  task: ExtendedTask
  onClose: () => void
  accentColour: string
}

export default function TaskItemEditor({ task, onClose, accentColour }: Props) {
  return (
    <div
      style={{ borderRightColor: accentColour }}
      className="bg-white border border-blue-300 border-r-4 rounded-md px-2.5 py-2"
    >
      <p className="text-sm text-slate-600">{task.title}</p>
      <button onClick={onClose} className="text-xs text-slate-400 mt-1">Close</button>
    </div>
  )
}
