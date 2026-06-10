-- Push notification trigger
-- Replaces the dashboard Database Webhook (which was either missing or calling
-- the Edge Function without an Authorization header, getting silent 401s).
--
-- Every INSERT into notifications fires an HTTP POST to the Edge Function,
-- with the anon key as Bearer token so verify_jwt passes.
--
-- Run this in the Supabase SQL editor.

create extension if not exists pg_net;

create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://gvzswhpmdfvblfovrsac.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2enN3aHBtZGZ2Ymxmb3Zyc2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODExNzksImV4cCI6MjA5NTg1NzE3OX0.fVj1EdvuPpBvQha951N0wIS3fmvuoWhBLCff8VV4wts'
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

drop trigger if exists on_notification_insert on public.notifications;

create trigger on_notification_insert
  after insert on public.notifications
  for each row
  execute function public.notify_push();
