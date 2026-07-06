-- Comments: one shared thread per task (Slack-style). The task owner and every
-- assignee with a non-cancelled request on the task can read and post.
-- `system` marks auto-posted activity lines (time changes, rejections) so the
-- UI can style them differently from human comments.

create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid not null references public.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  system     boolean not null default false,
  created_at timestamptz not null default now()
);

create index task_comments_task_created_idx
  on public.task_comments (task_id, created_at);

alter table public.task_comments enable row level security;

-- Participant = task owner, or an assignee whose request isn't cancelled.
create policy "Participants can read comments"
  on public.task_comments for select
  using (
    exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
    or exists (
      select 1 from public.reminder_requests rr
      where rr.task_id = task_comments.task_id
        and rr.assignee_id = auth.uid()
        and rr.status <> 'cancelled'
    )
  );

create policy "Participants can comment"
  on public.task_comments for insert
  with check (
    author_id = auth.uid()
    and (
      exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
      or exists (
        select 1 from public.reminder_requests rr
        where rr.task_id = task_comments.task_id
          and rr.assignee_id = auth.uid()
          and rr.status <> 'cancelled'
      )
    )
  );

-- No UPDATE/DELETE policies in v1: comments are append-only.

-- Realtime: the thread screen subscribes to INSERTs on this table.
alter publication supabase_realtime add table public.task_comments;
