-- E5 — habit reminders, Phase 5 of todo/push-notifications.md.
--
-- Every 5 minutes pg_cron calls the dispatch-notifications Edge Function, which
-- asks enqueue_due_reminders() to write this run's reminders into the
-- notifications outbox, then asks dispatchable_notifications() what to push.
-- Everything that decides lives here, tested in `supabase/tests/reminders.sql`;
-- the function is a courier, like send-nudge and check-receipts.
--
-- Reminders are server-side for one reason: a schedule on the phone cannot know
-- the habit was already ticked off, so it nags anyway — which is how people
-- learn to switch notifications off.


-- ---------------------------------------------------------------------------
-- is_quiet_time — whether a local wall-clock time falls in quiet hours.
--
-- `[start, end)`: the end minute is no longer quiet. The window may wrap
-- midnight (22:00–07:00 has start > end), so it is never a plain BETWEEN.
-- Null (quiet hours off) is never quiet.
-- ---------------------------------------------------------------------------

create or replace function public.is_quiet_time(p_time time, p_start time, p_end time)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $function$
  select case
    when p_start is null or p_end is null then false
    when p_start < p_end then p_time >= p_start and p_time < p_end
    else p_time >= p_start or p_time < p_end
  end
$function$;

revoke execute on function public.is_quiet_time(time, time, time) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- enqueue_due_reminders — this run's reminders, as pending outbox rows.
--
-- A habit is due when its `reminder_time` passed less than 5 minutes ago in
-- its owner's timezone — the cron interval, so each reminder time falls in
-- exactly one run and a missed run is skipped rather than sent late. Then:
--   - the owner's Reminders switch is on;
--   - the habit is scheduled on the day the reminder belongs to (a 23:58
--     reminder caught at 00:01 belongs to the day before);
--   - it is not ticked off for that day;
--   - it is not quiet hours for the owner right now (skipped, not delayed).
-- The dedupe key `reminder:<goal>:<day>` makes it once per habit per day,
-- however often the job runs. Returns the ids it inserted.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_due_reminders(p_now timestamptz default now())
  returns setof uuid
  language sql
  set search_path = ''
as $function$
  with local as (
    select g.id as goal_id, g.user_id, g.group_id, g.title, g.icon, g.repeat_days,
           p.quiet_start, p.quiet_end,
           (p_now at time zone p.timezone) as local_now,
           (p_now at time zone p.timezone)::time - g.reminder_time as raw_since
      from public.goals g
      join public.notification_prefs p on p.user_id = g.user_id
     where g.reminder_time is not null
       and p.reminders_enabled
  ), slot as (
    select l.*,
           case when l.raw_since < interval '0' then l.raw_since + interval '24 hours'
                else l.raw_since end as since
      from local l
  ), due as (
    select s.*, (s.local_now - s.since)::date as day
      from slot s
     where s.since < interval '5 minutes'
       and not public.is_quiet_time(s.local_now::time, s.quiet_start, s.quiet_end)
  )
  insert into public.notifications (recipient_id, group_id, type, title, body, data, dedupe_key)
  select d.user_id,
         d.group_id,
         'reminder',
         'Time for ' || d.title || coalesce(' ' || nullif(d.icon, ''), ''),
         'You haven''t ticked it off yet today.',
         jsonb_build_object('type', 'reminder', 'goal_id', d.goal_id, 'group_id', d.group_id),
         'reminder:' || d.goal_id || ':' || d.day
    from due d
   where (extract(isodow from d.day)::int - 1) = any (
           coalesce(nullif(d.repeat_days, '{}'), array[0, 1, 2, 3, 4, 5, 6]))
     and not exists (
           select 1 from public.logs l
            where l.goal_id = d.goal_id and l.date = d.day::text)
  on conflict (dedupe_key) do nothing
  returning id
$function$;

revoke execute on function public.enqueue_due_reminders(timestamptz) from public, anon, authenticated;
grant  execute on function public.enqueue_due_reminders(timestamptz) to service_role;


-- ---------------------------------------------------------------------------
-- dispatchable_notifications — what the dispatcher pushes this run.
--
-- The rows this run just enqueued (`p_fresh`), plus anything that has been
-- pending for between 2 and 60 minutes: a nudge whose push failed after its
-- row was written (send-nudge leaves it pending for exactly this). Younger
-- pending rows are send-nudge's own, mid-push. Older ones are marked failed —
-- a reminder or a nudge an hour late is worse than none.
-- ---------------------------------------------------------------------------

create or replace function public.dispatchable_notifications(p_fresh uuid[])
  returns table (id uuid, recipient_id uuid, title text, body text, data jsonb)
  language plpgsql
  set search_path = ''
as $function$
begin
  update public.notifications n
     set status = 'failed',
         error  = 'Expired before delivery'
   where n.status = 'pending'
     and n.created_at < now() - interval '1 hour'
     and not (n.id = any (coalesce(p_fresh, '{}')));

  return query
    select n.id, n.recipient_id, n.title, n.body, n.data
      from public.notifications n
     where n.status = 'pending'
       and (n.id = any (coalesce(p_fresh, '{}'))
            or n.created_at between now() - interval '1 hour' and now() - interval '2 minutes')
     order by n.created_at;
end;
$function$;

revoke execute on function public.dispatchable_notifications(uuid[]) from public, anon, authenticated;
grant  execute on function public.dispatchable_notifications(uuid[]) to service_role;


-- ---------------------------------------------------------------------------
-- The 5-minute job. Same Vault secrets as `check-push-receipts`
-- (`project_url`, `dispatch_secret`), so nothing new to set up beyond
-- deploying the function.
-- ---------------------------------------------------------------------------

select cron.schedule(
  'dispatch-notifications',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/dispatch-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_secret')
    ),
    body    := '{}'::jsonb
  );
  $job$
);
