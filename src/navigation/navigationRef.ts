import { createNavigationContainerRef } from '@react-navigation/native'
import type { TabParamList } from '@/navigation/AppNavigator'

// A ref to the root navigation container so code outside the React tree
// (notification tap handlers) can navigate.
export const navigationRef = createNavigationContainerRef<TabParamList>()

type NotificationData = {
  type?: string
  task_id?: string
  task_title?: string
  [key: string]: unknown
} | null | undefined

// Maps a tapped notification to the screen the user expects to land on.
export function routeFromNotification(data: NotificationData): void {
  if (!data?.type || !navigationRef.isReady()) return

  const taskId = typeof data.task_id === 'string' ? data.task_id : undefined

  switch (data.type) {
    // Incoming request to accept/reject lives in the Inbox.
    case 'reminder_request':
      navigationRef.navigate('Inbox', { tab: 'requests' })
      break

    // A friend completed a task you reminded them about → Inbox > Completed.
    case 'task_done':
      navigationRef.navigate('Inbox', { tab: 'completed' })
      break

    // It's time for YOU to send a reminder → Home, where the send button lives.
    case 'reminder_due':
      navigationRef.navigate('DashboardTab', { screen: 'Dashboard' })
      break

    // Something happened to one of YOUR tasks → open that task on Home.
    case 'reminder_sent':
    case 'request_accepted':
    case 'request_rejected':
    case 'request_cancelled':
    case 'task_failed':
      if (taskId) {
        navigationRef.navigate('DashboardTab', { screen: 'TaskDetail', params: { taskId } })
      } else {
        navigationRef.navigate('DashboardTab', { screen: 'Dashboard' })
      }
      break

    case 'friend_request':
    case 'friend_accepted':
      navigationRef.navigate('Friends')
      break

    // Someone commented on a task you're part of → open the thread.
    case 'task_comment':
      if (taskId) {
        navigationRef.navigate('DashboardTab', {
          screen: 'Comments',
          params: { taskId, taskTitle: typeof data.task_title === 'string' ? data.task_title : undefined },
        })
      }
      break
  }
}
