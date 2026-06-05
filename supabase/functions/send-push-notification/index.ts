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
  reminder_sent: (p) => ({
    title: '🔔 Reminder!',
    body: `@${p.from_username} is reminding you: "${p.task_title}"`,
  }),
  task_done: (p) => ({
    title: '🎉 Task completed!',
    body: `@${p.owner_username} completed "${p.task_title}". You both earned points!`,
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
      return new Response('Missing fields', { status: 400 })
    }

    // Look up recipient's push token
    const { data: user, error } = await supabase
      .from('users')
      .select('expo_push_token')
      .eq('id', recipient_id)
      .single()

    if (error || !user?.expo_push_token) {
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
        interruptionLevel: 'timeSensitive',
      }),
    })

    const result = await response.json()
    return new Response(JSON.stringify(result), { status: 200 })

  } catch (err) {
    return new Response(String(err), { status: 500 })
  }
})
