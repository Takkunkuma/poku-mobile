-- Scheduled "time to remind" nudges
--
-- Every minute, pg_cron scans accepted reminder_requests whose next reminder
-- time has arrived and inserts a 'reminder_due' notification for the assignee.
-- The existing notifications trigger then delivers it as a background push.
--
-- Due time for the Nth reminder (0-indexed by reminders_sent):
--   scheduled_at + interval_minutes * reminders_sent
--
-- nudges_sent tracks which occurrence has already been nudged so each
-- reminder slot nudges exactly once (nudge fires when nudges_sent <= reminders_sent).

create extension if not exists pg_cron;

alter table public.reminder_requests
  add column if not exists nudges_sent int not null default 0;

create or replace function public.nudge_due_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select rr.id, rr.assignee_id, rr.reminders_sent,
           t.title as task_title, u.username as requester_username
    from reminder_requests rr
    join tasks t on t.id = rr.task_id
    join users u on u.id = rr.requester_id
    where rr.status = 'accepted'
      and rr.reminders_sent < rr.repeat_count
      and rr.nudges_sent <= rr.reminders_sent
      and now() >= rr.scheduled_at
                   + make_interval(mins => coalesce(rr.interval_minutes, 0) * rr.reminders_sent)
  loop
    insert into notifications (recipient_id, type, payload)
    values (
      r.assignee_id,
      'reminder_due',
      jsonb_build_object(
        'task_title', r.task_title,
        'from_username', r.requester_username,
        'reminder_number', r.reminders_sent + 1,
        'request_id', r.id
      )
    );

    update reminder_requests
    set nudges_sent = r.reminders_sent + 1
    where id = r.id;
  end loop;
end;
$$;

-- (Re)schedule the job idempotently
do $$
begin
  perform cron.unschedule('nudge-due-reminders');
exception when others then
  null; -- job didn't exist yet
end $$;

select cron.schedule('nudge-due-reminders', '* * * * *', 'select public.nudge_due_reminders()');
