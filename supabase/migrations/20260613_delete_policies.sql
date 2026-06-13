-- Allow owners to delete their own tasks and the reminder requests they created.
-- Without these, RLS silently filters the DELETE (0 rows, no error) so the app
-- thinks the delete worked while the row stays in the table.

create policy "Owner can delete own tasks"
  on public.tasks
  for delete
  using (auth.uid() = owner_id);

create policy "Requester can delete their requests"
  on public.reminder_requests
  for delete
  using (auth.uid() = requester_id);
