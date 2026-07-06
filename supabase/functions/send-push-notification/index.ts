import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const NOTIF_MESSAGES: Record<string, (p: Record<string, string>) => { title: string; body: string }> = {
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
    body: `${p.rejection_reason ? `"${p.rejection_reason}"` : 'Your reminder request was rejected.'}`,
  }),
  request_cancelled: (p) => ({
    title: '🚫 Request canceled',
    body: `@${p.from_username} canceled their reminder request for "${p.task_title}".`,
  }),
  reminder_sent: (p) => ({
    title: '🔔 Reminder!',
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

Deno.serve(async (req) => {
  try {
    const body = await req.json()

    // Supabase database webhook wraps the row under `record`
    const record = body.record ?? body.new ?? body
    const { recipient_id, type } = record
    // payload column is jsonb — may arrive as object or JSON string
    const payload = typeof record.payload === 'string'
      ? JSON.parse(record.payload)
      : (record.payload ?? {})

    if (!recipient_id || !type) {
      console.error('[push] Missing fields — recipient_id or type absent', JSON.stringify(record))
      return new Response('Missing fields', { status: 400 })
    }

    // Look up recipient's push token
    const { data: user, error } = await supabase
      .from('users')
      .select('expo_push_token')
      .eq('id', recipient_id)
      .single()

    if (error || !user?.expo_push_token) {
      console.error(`[push] No push token for recipient ${recipient_id}`, error?.message ?? '')
      return new Response('No push token', { status: 200 })
    }

    const builder = NOTIF_MESSAGES[type]
    if (!builder) return new Response('Unknown type', { status: 200 })

    const { title, body: notifBody } = builder(payload ?? {})

    // Send via Expo Push API
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: user.expo_push_token,
        title,
        body: notifBody,
        sound: 'default',
        priority: 'high',
        interruptionLevel: 'time-sensitive',
        // Carried through to the app so a tap deep-links to the right screen.
        data: { type, ...payload },
      }),
    })

    const result = await response.json()

    // Expo returns a ticket per message — surface errors instead of swallowing them
    if (result?.errors?.length) {
      console.error(`[push] Expo request-level error for ${recipient_id}:`, JSON.stringify(result.errors))
      return new Response(JSON.stringify(result), { status: 200 })
    }
    const ticket = result?.data
    if (ticket?.status === 'error') {
      console.error(`[push] Expo rejected push to ${recipient_id}:`, JSON.stringify(ticket))
      // Token is dead (app uninstalled / token rotated) — clear it so we stop retrying
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await supabase.from('users').update({ expo_push_token: null }).eq('id', recipient_id)
        console.log(`[push] Cleared dead token for ${recipient_id}`)
      }
    } else {
      console.log(`[push] Sent "${type}" to ${recipient_id} — ticket: ${ticket?.id ?? 'unknown'}`)
    }

    return new Response(JSON.stringify(result), { status: 200 })

  } catch (err) {
    console.error('[push] Unhandled error:', String(err))
    return new Response(String(err), { status: 500 })
  }
})
