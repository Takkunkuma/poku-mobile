import { supabase } from '@/lib/supabase'

export type TaskComment = {
  id: string
  task_id: string
  author_id: string
  body: string
  system: boolean
  created_at: string
  author: { username: string } | null
}

export async function fetchComments(taskId: string): Promise<TaskComment[]> {
  const { data } = await supabase
    .from('task_comments')
    .select('id, task_id, author_id, body, system, created_at, author:users!task_comments_author_id_fkey(username)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  return (data ?? []) as unknown as TaskComment[]
}

// Post a comment and notify every other participant (task owner + assignees
// with a non-cancelled request). `system: true` marks auto-posted activity
// lines (time changes, rejections) so the UI styles them as events, not chat.
// Pass `notify: false` when the action already sends its own push (e.g. a time
// change fires reminder_request) so people don't get two notifications.
//
// Returns true if the comment itself saved. Notification fan-out failures are
// non-fatal — the comment is still in the thread; the others just may not get
// a push.
export async function postComment(opts: {
  taskId: string
  taskTitle: string
  authorId: string
  authorUsername: string
  body: string
  system?: boolean
  notify?: boolean
}): Promise<boolean> {
  const body = opts.body.trim()
  if (!body) return false

  const { error } = await supabase.from('task_comments').insert({
    task_id: opts.taskId,
    author_id: opts.authorId,
    body,
    system: opts.system ?? false,
  })
  if (error) return false
  if (opts.notify === false) return true

  // Fan out a push/in-app notification to everyone else on the thread.
  const [taskRes, reqRes] = await Promise.all([
    supabase.from('tasks').select('owner_id').eq('id', opts.taskId).single(),
    supabase
      .from('reminder_requests')
      .select('assignee_id')
      .eq('task_id', opts.taskId)
      .neq('status', 'cancelled'),
  ])

  const recipients = new Set<string>()
  if (taskRes.data?.owner_id) recipients.add(taskRes.data.owner_id)
  ;(reqRes.data ?? []).forEach(r => recipients.add(r.assignee_id))
  recipients.delete(opts.authorId)

  const snippet = body.length > 80 ? `${body.slice(0, 77)}...` : body
  await Promise.all([...recipients].map(recipientId =>
    supabase.from('notifications').insert({
      recipient_id: recipientId,
      type: 'task_comment',
      payload: {
        task_id: opts.taskId,
        task_title: opts.taskTitle,
        from_username: opts.authorUsername,
        snippet,
      },
    })
  ))

  return true
}
