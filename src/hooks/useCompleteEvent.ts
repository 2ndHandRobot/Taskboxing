import { useCalendarStore } from '../stores/calendar-store'
import { useTasksStore } from '../stores/tasks-store'
import type { ExtendedCalendarEvent } from '../types/task.types'

export function useCompleteEvent() {
  const { completeEvent, uncompleteEvent } = useCalendarStore()
  const { completeTask, reopenTask } = useTasksStore()

  return {
    completeEvent: async (event: ExtendedCalendarEvent) => {
      if (event.linkedTaskId && event.linkedTaskListId) {
        // State derives from task — only update the task
        await completeTask(event.linkedTaskListId, event.linkedTaskId)
      } else {
        await completeEvent(event.id)
      }
    },
    uncompleteEvent: async (event: ExtendedCalendarEvent) => {
      if (event.linkedTaskId && event.linkedTaskListId) {
        await reopenTask(event.linkedTaskListId, event.linkedTaskId)
      } else {
        await uncompleteEvent(event.id)
      }
    },
  }
}
