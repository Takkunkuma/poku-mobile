import React, { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { scheduleLocalNotification } from '@/lib/notifications'
import { routeFromNotification } from '@/navigation/navigationRef'

const NOTIF_MESSAGES: Record<string, (payload: Record<string, string>) => { title: string; body: string }> = {
  reminder_request: (p) => ({
    title: '📨 New reminder request',
    body: `@${p.from_username} wants you to remind them: "${p.task_title}"`,
  }),
  request_accepted: (p) => ({
    title: '✅ Request accepted',
    body: `Your reminder request for "${p.task_title}" was accepted!`,
  }),
  request_rejected: (p) => ({
    title: '❌ Request rejected',
    body: `Your reminder request for "${p.task_title}" was rejected.`,
  }),
  request_cancelled: (p) => ({
    title: '🚫 Request canceled',
    body: `@${p.from_username} canceled their reminder request for "${p.task_title}".`,
  }),
  reminder_sent: (p) => ({
    title: '🔔 Reminder received!',
    body: `@${p.from_username} is reminding you: "${p.task_title}"`,
  }),
  reminder_due: (p) => ({
    title: '⏰ Time to remind!',
    body: `Send @${p.from_username} reminder #${p.reminder_number} for "${p.task_title}"`,
  }),
  task_done: (p) => ({
    title: '🎉 Task completed!',
    body: `@${p.owner_username} completed "${p.task_title}". You both earned points!`,
  }),
  task_failed: (p) => ({
    title: '😬 Task not completed',
    body: `@${p.owner_username} didn't complete "${p.task_title}" after all reminders. -${p.penalty} point${p.penalty === '1' ? '' : 's'}.`,
  }),
  friend_request: (p) => ({
    title: '👋 New friend request',
    body: `@${p.from_username} wants to be friends!`,
  }),
  friend_accepted: (p) => ({
    title: '🤝 Friend added',
    body: `@${p.from_username} accepted your friend request!`,
  }),
  task_comment: (p) => ({
    title: '💬 New comment',
    body: `@${p.from_username} on "${p.task_title}": ${p.snippet}`,
  }),
}

export default function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as { type: string; payload: Record<string, string> }
        const builder = NOTIF_MESSAGES[n.type]
        if (builder) {
          const { title, body } = builder(n.payload)
          // Carry the type + payload so a tap on this local notification routes
          // to the right screen, same as a background push.
          scheduleLocalNotification(title, body, { type: n.type, ...n.payload })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  // Notification taps → deep-link to the relevant screen. Handles both taps
  // while the app is running and a tap that cold-launched the app.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromNotification(response.notification.request.content.data)
    })

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) routeFromNotification(response.notification.request.content.data)
    })

    return () => sub.remove()
  }, [])

  return <>{children}</>
}
