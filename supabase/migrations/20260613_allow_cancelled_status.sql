-- The app uses a 'cancelled' reminder_request status (when you cancel a request
-- you sent, and when completing a task cancels leftover requests), but the
-- status CHECK constraint never allowed it, so those updates errored.

alter table public.reminder_requests
  drop constraint if exists reminder_requests_status_check;

alter table public.reminder_requests
  add constraint reminder_requests_status_check
  check (status = any (array['pending', 'accepted', 'rejected', 'sent', 'cancelled']));
