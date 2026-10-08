-- Habit reminders (E5, 2026-10-08): `enqueue_due_reminders(p_now)` decides
-- which habits get a reminder this run, and `dispatchable_notifications(ids)`
-- what the dispatcher sends. Both are called every 5 minutes by the
-- dispatch-notifications Edge Function.
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reminders.sql
-- Each case raises on failure; everything runs in one transaction that is
-- rolled back, so nothing is left behind.
--
-- `p_now` is passed explicitly so a case can stand at any wall-clock time. The
-- times are built on `current_date`, because a log may only be dated within a
-- day of the server's date.

begin;

create function pg_temp.mk_user(p_tz text default 'UTC')
  returns uuid language plpgsql as $$
declare _id uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (_id);
  insert into public.notification_prefs (user_id) values (_id) on conflict (user_id) do nothing;
  update public.notification_prefs set timezone = p_tz where user_id = _id;
  return _id;
end $$;

create function pg_temp.mk_goal(
  p_user uuid, p_time time, p_days int[] default array[0,1,2,3,4,5,6],
  p_title text default 'Run', p_icon text default '🏃')
  returns uuid language plpgsql as $$
declare _g uuid; _goal uuid;
begin
  insert into public.groups (name) values ('test') returning id into _g;
  insert into public.group_members (group_id, user_id) values (_g, p_user);
  insert into public.goals (user_id, group_id, title, icon, repeat_days, reminder_time)
  values (p_user, _g, p_title, p_icon, p_days, p_time) returning id into _goal;
  return _goal;
end $$;

-- `p_local` on `p_day` (default today), as seen in `p_tz`.
create function pg_temp.at(p_local time, p_tz text default 'UTC', p_day date default current_date)
  returns timestamptz language sql as $$
  select (p_day + p_local) at time zone p_tz
$$;

create function pg_temp.today_idx(p_day date default current_date)
  returns int language sql as $$ select extract(isodow from p_day)::int - 1 $$;

create function pg_temp.reminders_for(p_goal uuid)
  returns int language sql as $$
  select count(*)::int from public.notifications
   where type = 'reminder' and data->>'goal_id' = p_goal::text
$$;

create function pg_temp.expect(p_goal uuid, p_count int, p_case text)
  returns void language plpgsql as $$
begin
  if pg_temp.reminders_for(p_goal) <> p_count then
    raise exception '%: expected % reminder(s), got %', p_case, p_count, pg_temp.reminders_for(p_goal);
  end if;
end $$;

-- 1. A habit due now gets one pending reminder, worded for its owner.
do $$
declare u uuid := pg_temp.mk_user(); g uuid := pg_temp.mk_goal(u, '08:00'); n public.notifications;
begin
  perform public.enqueue_due_reminders(pg_temp.at('08:02'));
  select * into n from public.notifications where data->>'goal_id' = g::text;
  if n.id is null then raise exception 'case 1: no reminder'; end if;
  if n.recipient_id <> u or n.sender_id is not null or n.status <> 'pending'
     or n.title <> 'Time for Run 🏃' or n.body <> 'You haven''t ticked it off yet today.'
     or n.group_id is null or n.data->>'type' <> 'reminder'
     or n.dedupe_key <> 'reminder:' || g || ':' || current_date then
    raise exception 'case 1: unexpected row %', row_to_json(n);
  end if;
end $$;

-- 2. It returns the ids it inserted, and nothing on a run with nothing due.
do $$
declare u uuid := pg_temp.mk_user(); g uuid := pg_temp.mk_goal(u, '06:10'); ids uuid[];
begin
  select array_agg(x) into ids from public.enqueue_due_reminders(pg_temp.at('06:10')) x;
  if ids is null or not exists (select 1 from public.notifications where id = any (ids) and data->>'goal_id' = g::text) then
    raise exception 'case 2: the new reminder''s id was not returned, got %', ids;
  end if;
  select array_agg(x) into ids from public.enqueue_due_reminders(pg_temp.at('06:10')) x;
  if exists (select 1 from public.notifications where id = any (coalesce(ids, '{}')) and data->>'goal_id' = g::text) then
    raise exception 'case 2: a second run returned the same reminder again';
  end if;
end $$;

-- 3. The window is the 5 minutes from the reminder time: not before, not after.
do $$
declare u uuid := pg_temp.mk_user();
        early uuid := pg_temp.mk_goal(u, '09:00');
        late uuid := pg_temp.mk_goal(u, '08:54');
        edge uuid := pg_temp.mk_goal(u, '08:56');
begin
  perform public.enqueue_due_reminders(pg_temp.at('08:59:59'));
  perform pg_temp.expect(early, 0, 'case 3 (one second early)');
  perform pg_temp.expect(edge, 1, 'case 3 (inside the window)');
  perform public.enqueue_due_reminders(pg_temp.at('09:00'));
  perform pg_temp.expect(late, 0, 'case 3 (window passed, never sent late)');
  perform pg_temp.expect(early, 1, 'case 3 (on the minute)');
end $$;

-- 4. Once per habit per day, however often the job runs inside the window.
do $$
declare u uuid := pg_temp.mk_user(); g uuid := pg_temp.mk_goal(u, '10:00');
begin
  perform public.enqueue_due_reminders(pg_temp.at('10:00'));
  perform public.enqueue_due_reminders(pg_temp.at('10:04'));
  perform pg_temp.expect(g, 1, 'case 4');
end $$;

-- 5. Only on scheduled days; an empty schedule means every day.
do $$
declare u uuid := pg_temp.mk_user();
        today_only uuid := pg_temp.mk_goal(u, '11:00', array[pg_temp.today_idx()]);
        other_day uuid := pg_temp.mk_goal(u, '11:00', array[(pg_temp.today_idx() + 1) % 7]);
        every_day uuid := pg_temp.mk_goal(u, '11:00', '{}');
begin
  perform public.enqueue_due_reminders(pg_temp.at('11:01'));
  perform pg_temp.expect(today_only, 1, 'case 5 (scheduled today)');
  perform pg_temp.expect(other_day, 0, 'case 5 (not scheduled today)');
  perform pg_temp.expect(every_day, 1, 'case 5 (empty means every day)');
end $$;

-- 6. Not once it is ticked off today — a tick from yesterday does not count.
do $$
declare u uuid := pg_temp.mk_user();
        done uuid := pg_temp.mk_goal(u, '12:00');
        done_yesterday uuid := pg_temp.mk_goal(u, '12:00');
begin
  insert into public.logs (goal_id, user_id, date) values (done, u, current_date::text);
  insert into public.logs (goal_id, user_id, date) values (done_yesterday, u, (current_date - 1)::text);
  perform public.enqueue_due_reminders(pg_temp.at('12:00'));
  perform pg_temp.expect(done, 0, 'case 6 (ticked today)');
  perform pg_temp.expect(done_yesterday, 1, 'case 6 (ticked yesterday only)');
end $$;

-- 7. A habit with no reminder time never gets one.
do $$
declare u uuid := pg_temp.mk_user(); g uuid := pg_temp.mk_goal(u, null);
begin
  perform public.enqueue_due_reminders(pg_temp.at('12:00'));
  perform pg_temp.expect(g, 0, 'case 7');
end $$;

-- 8. The Reminders switch turns them all off.
do $$
declare u uuid := pg_temp.mk_user(); g uuid := pg_temp.mk_goal(u, '13:00');
begin
  update public.notification_prefs set reminders_enabled = false where user_id = u;
  perform public.enqueue_due_reminders(pg_temp.at('13:00'));
  perform pg_temp.expect(g, 0, 'case 8');
end $$;

-- 9. The owner's own timezone decides when "08:00" is.
do $$
declare u uuid := pg_temp.mk_user('Asia/Tokyo'); g uuid := pg_temp.mk_goal(u, '08:00');
begin
  perform public.enqueue_due_reminders(pg_temp.at('08:00', 'UTC'));
  perform pg_temp.expect(g, 0, 'case 9 (08:00 UTC is not 08:00 in Tokyo)');
  perform public.enqueue_due_reminders(pg_temp.at('08:01', 'Asia/Tokyo'));
  perform pg_temp.expect(g, 1, 'case 9 (08:01 in Tokyo)');
end $$;

-- 10. Quiet hours skip a reminder, including a window that wraps midnight;
--     the minute the window ends, reminders go again.
do $$
declare u uuid := pg_temp.mk_user(); v uuid := pg_temp.mk_user();
        in_day_window uuid := pg_temp.mk_goal(u, '14:00');
        at_end uuid := pg_temp.mk_goal(u, '15:00');
        in_wrap uuid := pg_temp.mk_goal(v, '06:30');
        outside_wrap uuid := pg_temp.mk_goal(v, '21:00');
begin
  update public.notification_prefs set quiet_start = '13:00', quiet_end = '15:00' where user_id = u;
  update public.notification_prefs set quiet_start = '22:00', quiet_end = '07:00' where user_id = v;
  perform public.enqueue_due_reminders(pg_temp.at('14:00'));
  perform public.enqueue_due_reminders(pg_temp.at('15:00'));
  perform public.enqueue_due_reminders(pg_temp.at('06:30'));
  perform public.enqueue_due_reminders(pg_temp.at('21:00'));
  perform pg_temp.expect(in_day_window, 0, 'case 10 (inside 13:00-15:00)');
  perform pg_temp.expect(at_end, 1, 'case 10 (15:00 ends the window)');
  perform pg_temp.expect(in_wrap, 0, 'case 10 (inside 22:00-07:00)');
  perform pg_temp.expect(outside_wrap, 1, 'case 10 (outside 22:00-07:00)');
end $$;

-- 11. A reminder at 23:58 caught at 00:01 belongs to the day it was set for:
--     that day's schedule, that day's tick, that day's dedupe key.
do $$
declare u uuid := pg_temp.mk_user();
        yesterday date := current_date - 1;
        due uuid := pg_temp.mk_goal(u, '23:58', array[pg_temp.today_idx(yesterday)]);
        ticked uuid := pg_temp.mk_goal(u, '23:58');
        n public.notifications;
begin
  insert into public.logs (goal_id, user_id, date) values (ticked, u, yesterday::text);
  perform public.enqueue_due_reminders(pg_temp.at('00:01'));
  select * into n from public.notifications where data->>'goal_id' = due::text;
  if n.id is null or n.dedupe_key <> 'reminder:' || due || ':' || yesterday then
    raise exception 'case 11: expected yesterday''s reminder, got %', row_to_json(n);
  end if;
  perform pg_temp.expect(ticked, 0, 'case 11 (ticked yesterday)');
end $$;

-- 12. No icon, no trailing space.
do $$
declare u uuid := pg_temp.mk_user(); g uuid := pg_temp.mk_goal(u, '16:00', p_title => 'Read', p_icon => null);
begin
  perform public.enqueue_due_reminders(pg_temp.at('16:00'));
  if (select title from public.notifications where data->>'goal_id' = g::text) <> 'Time for Read' then
    raise exception 'case 12: got %', (select title from public.notifications where data->>'goal_id' = g::text);
  end if;
end $$;

-- 13. What the dispatcher sends: what this run enqueued, plus anything pending
--     for 2 to 60 minutes (a nudge whose push failed mid-flight). A row pending
--     for longer is marked failed instead of arriving hours late, and a nudge
--     send-nudge is pushing right now is left to it.
do $$
declare u uuid := pg_temp.mk_user();
        fresh uuid; stuck uuid; in_flight uuid; ancient uuid; sent uuid;
        ids uuid[];
begin
  insert into public.notifications (recipient_id, type, title, body, dedupe_key)
    values (u, 'reminder', 't', 'b', 'd:fresh') returning id into fresh;
  insert into public.notifications (recipient_id, type, title, body, dedupe_key, created_at)
    values (u, 'nudge', 't', 'b', 'd:stuck', now() - interval '10 minutes') returning id into stuck;
  insert into public.notifications (recipient_id, type, title, body, dedupe_key, created_at)
    values (u, 'nudge', 't', 'b', 'd:in-flight', now() - interval '30 seconds') returning id into in_flight;
  insert into public.notifications (recipient_id, type, title, body, dedupe_key, created_at)
    values (u, 'reminder', 't', 'b', 'd:ancient', now() - interval '2 hours') returning id into ancient;
  insert into public.notifications (recipient_id, type, title, body, dedupe_key, status, created_at)
    values (u, 'nudge', 't', 'b', 'd:sent', 'sent', now() - interval '10 minutes') returning id into sent;

  select array_agg(id order by id) into ids from public.dispatchable_notifications(array[fresh]);
  if ids is distinct from (select array_agg(x order by x) from unnest(array[fresh, stuck]) x) then
    raise exception 'case 13: expected fresh and stuck, got %', ids;
  end if;
  if (select status from public.notifications where id = ancient) <> 'failed'
     or (select error from public.notifications where id = ancient) <> 'Expired before delivery' then
    raise exception 'case 13: the two-hour-old row was not expired';
  end if;
  if (select status from public.notifications where id = in_flight) <> 'pending' then
    raise exception 'case 13: the in-flight nudge was touched';
  end if;
end $$;

-- 14. A dispatchable row carries what the push needs.
do $$
declare u uuid := pg_temp.mk_user(); g uuid := pg_temp.mk_goal(u, '17:00'); r record;
begin
  select * into r from public.dispatchable_notifications(
    array(select public.enqueue_due_reminders(pg_temp.at('17:00')))) d
   where d.data->>'goal_id' = g::text;
  if r.recipient_id <> u or r.title <> 'Time for Run 🏃' or r.body is null or r.data->>'type' <> 'reminder' then
    raise exception 'case 14: got %', row_to_json(r);
  end if;
end $$;

-- 15. None of it is reachable from the app.
do $$
begin
  if has_function_privilege('authenticated', 'public.enqueue_due_reminders(timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.enqueue_due_reminders(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.dispatchable_notifications(uuid[])', 'execute')
     or has_function_privilege('anon', 'public.dispatchable_notifications(uuid[])', 'execute') then
    raise exception 'case 15: a client role can execute the reminder functions';
  end if;
  if not has_function_privilege('service_role', 'public.enqueue_due_reminders(timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.dispatchable_notifications(uuid[])', 'execute') then
    raise exception 'case 15: service_role cannot execute the reminder functions';
  end if;
end $$;

-- 16. The job runs every 5 minutes and calls dispatch-notifications.
do $$
declare j record;
begin
  select * into j from cron.job where jobname = 'dispatch-notifications';
  if j is null or j.schedule <> '*/5 * * * *' or j.command not like '%/functions/v1/dispatch-notifications%' then
    raise exception 'case 16: expected a 5-minute dispatch job, got %', row_to_json(j);
  end if;
end $$;

do $$ begin raise notice 'reminders: all cases passed'; end $$;

rollback;
