import { useTasksStore } from '../stores/tasks-store'
import type { ExtendedTask } from '../types/task.types'

export function useCompleteTask() {
  const { completeTask, reopenTask } = useTasksStore()

  return {
    completeTask: async (task: ExtendedTask) => {
      await completeTask(task.taskListId, task.id)
    },
    uncompleteTask: async (task: ExtendedTask) => {
      await reopenTask(task.taskListId, task.id)
    },
  }
}
