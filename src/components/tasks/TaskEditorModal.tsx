import { Dialog, DialogPanel } from '@headlessui/react'
import { useUIStore } from '../../stores/ui-store'
import TaskEditorForm from './TaskEditorForm'

export default function TaskEditorModal() {
  const { isTaskEditorOpen, closeTaskEditor, selectedTaskId, editorInitialTask, editorIsNew } = useUIStore()

  return (
    <Dialog open={isTaskEditorOpen} onClose={closeTaskEditor} className="relative z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />

      {/* Panel */}
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-start justify-center p-4 pt-8">
          <DialogPanel className="w-full max-w-sm bg-white rounded-xl shadow-xl">
            <TaskEditorForm
              taskId={editorIsNew ? null : selectedTaskId}
              initialData={editorInitialTask}
              onClose={closeTaskEditor}
            />
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
