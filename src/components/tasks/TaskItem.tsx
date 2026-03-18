import type { ExtendedTask } from '../../types/task.types'

export default function TaskItem({ task }: { task: ExtendedTask }) {
  return (
    <div className="px-2 py-1.5 text-sm text-slate-700 bg-white rounded border border-slate-200">
      {task.title}
    </div>
  )
}
