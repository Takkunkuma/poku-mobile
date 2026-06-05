import React, { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { scheduleLocalNotification } from '@/lib/notifications'

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
  reminder_sent: (p) => ({
    title: '🔔 Reminder received!',
    body: `@${p.from_username} is reminding you: "${p.task_title}"`,
  }),
  task_done: (p) => ({
    title: '🎉 Task completed!',
    body: `@${p.owner_username} completed "${p.task_title}". You both earned +1 point!`,
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
          scheduleLocalNotification(title, body)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  return <>{children}</>
}
