-- Social events (E5, 2026-10-08): `enqueue_social_events(p_now)` turns the
-- last few minutes of check-ins and group joins into pending outbox rows for
-- the actor's buddies. Called every 5 minutes by the dispatch-notifications
-- Edge Function, beside `enqueue_due_reminders`.
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/social_events.sql
-- Each case raises on failure; everything runs in one transaction that is
-- rolled back, so nothing is left behind.
--
-- Every case builds its own group, so the counts never see another case's
-- rows. Check-ins are stamped a minute before `p_now` unless the case is about
-- the window.

begin;

create function pg_temp.mk_group(p_name text default 'Swole Mates')
  returns uuid language sql as $$
  insert into public.groups (name) values (p_name) returning id
$$;

create function pg_temp.mk_member(
  p_group uuid, p_name text, p_tz text default 'UTC',
  p_joined timestamptz default now() - interval '1 day')
  returns uuid language plpgsql as $$
declare _id uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (_id);
  insert into public.profiles (id, full_name) values (_id, p_name)
    on conflict (id) do update set full_name = excluded.full_name;
  insert into public.notification_prefs (user_id) values (_id) on conflict (user_id) do nothing;
  update public.notification_prefs set timezone = p_tz where user_id = _id;
  if p_group is not null then
    insert into public.group_members (group_id, user_id, joined_at) values (p_group, _id, p_joined);
  end if;
  return _id;
end $$;

create function pg_temp.mk_goal(
  p_user uuid, p_group uuid, p_title text, p_icon text default null,
  p_days int[] default array[0,1,2,3,4,5,6])
  returns uuid language sql as $$
  insert into public.goals (user_id, group_id, title, icon, repeat_days)
  values (p_user, p_group, p_title, p_icon, p_days) returning id
$$;

create function pg_temp.tick(p_goal uuid, p_at timestamptz default now() - interval '1 minute',
                             p_date date default current_date)
  returns void language sql as $$
  insert into public.logs (goal_id, user_id, date, created_at)
  select id, user_id, p_date::text, p_at from public.goals where id = p_goal
$$;

create function pg_temp.untick(p_goal uuid, p_date date default current_date)
  returns void language sql as $$
  delete from public.logs where goal_id = p_goal and date = p_date::text
$$;

create function pg_temp.run(p_now timestamptz default now())
  returns uuid[] language sql as $$
  select coalesce(array_agg(id), '{}') from public.enqueue_social_events(p_now) as id
$$;

create function pg_temp.sent_to(p_user uuid, p_type text default null)
  returns setof public.notifications language sql as $$
  select * from public.notifications
   where recipient_id = p_user and (p_type is null or type = p_type)
   order by created_at, title
$$;

create function pg_temp.count_to(p_user uuid, p_type text default null)
  returns int language sql as $$ select count(*)::int from pg_temp.sent_to(p_user, p_type) $$;

create function pg_temp.expect_count(p_user uuid, p_type text, p_count int, p_case text)
  returns void language plpgsql as $$
begin
  if pg_temp.count_to(p_user, p_type) <> p_count then
    raise exception '%: expected % % row(s), got %', p_case, p_count, coalesce(p_type, 'any'),
      pg_temp.count_to(p_user, p_type);
  end if;
end $$;

-- A weekday no habit in these cases is due on, and one every habit is.
create function pg_temp.not_today()
  returns int[] language sql as $$ select array[(extract(isodow from current_date)::int) % 7] $$;


-- 1. One tick tells each buddy, by first name, with the day's count. The
--    actor hears nothing about their own tick.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada Lovelace');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read 20 pages', '📚');
  n public.notifications;
begin
  perform pg_temp.tick(run);
  perform pg_temp.run();
  select * into n from pg_temp.sent_to(bob);
  if n.id is null then raise exception 'case 1: no notification for the buddy'; end if;
  if n.type <> 'buddy_ticked' or n.status <> 'pending' or n.sender_id <> ada or n.group_id <> g
     or n.title <> 'Ada ticked Run 🏃' or n.body <> '1 of 2 done today'
     or n.data->>'type' <> 'buddy_ticked' or n.data->>'buddy_id' <> ada::text
     or n.data->>'group_id' <> g::text then
    raise exception 'case 1: unexpected row %', row_to_json(n);
  end if;
  perform pg_temp.expect_count(ada, null, 0, 'case 1 (actor)');
  perform pg_temp.expect_count(bob, null, 1, 'case 1 (one row)');
end $$;

-- 2. Several ticks in one window are one push: the count and the icons in the
--    order they were ticked, since the names would not fit. A habit with no
--    icon just adds none.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
  plain uuid := pg_temp.mk_goal(ada, g, 'Stretch');
  more uuid := pg_temp.mk_goal(ada, g, 'Code', '💻');
  n public.notifications;
begin
  perform pg_temp.tick(run, now() - interval '3 minutes');
  perform pg_temp.tick(read, now() - interval '2 minutes');
  perform pg_temp.tick(plain, now() - interval '1 minute');
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, null, 1, 'case 2');
  select * into n from pg_temp.sent_to(bob);
  if n.title <> 'Ada ticked 3 habits 🏃📚' or n.body <> '3 of 4 done today' then
    raise exception 'case 2: unexpected wording "%" / "%"', n.title, n.body;
  end if;
end $$;

-- 3. A habit is announced once a day: untick and tick it again, and the next
--    run says nothing. A different habit later is a new push.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
  spare uuid := pg_temp.mk_goal(ada, g, 'Code', '💻');
begin
  perform pg_temp.tick(run, now() - interval '10 minutes');
  perform pg_temp.run(now() - interval '8 minutes');
  perform pg_temp.untick(run);
  perform pg_temp.tick(run);
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, null, 1, 'case 3 (re-tick)');

  perform pg_temp.tick(read);
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, 'buddy_ticked', 2, 'case 3 (new habit)');
end $$;

-- 4. Unticked before the run: it is not announced, and with nothing left
--    nothing is sent.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
  spare uuid := pg_temp.mk_goal(ada, g, 'Code', '💻');
  n public.notifications;
begin
  perform pg_temp.tick(run);
  perform pg_temp.untick(run);
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, null, 0, 'case 4 (all unticked)');

  perform pg_temp.tick(run);
  perform pg_temp.tick(read);
  perform pg_temp.untick(run);
  perform pg_temp.run();
  select * into n from pg_temp.sent_to(bob);
  if n.title <> 'Ada ticked Read 📚' or n.body <> '1 of 3 done today' then
    raise exception 'case 4: unexpected wording "%" / "%"', n.title, n.body;
  end if;
end $$;

-- 5. The tick that closes the day sends the day-closed push instead, never
--    both, with its own once-a-day key.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
  n public.notifications;
begin
  perform pg_temp.tick(run, now() - interval '10 minutes');
  perform pg_temp.run(now() - interval '8 minutes');
  perform pg_temp.tick(read);
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, 'buddy_ticked', 1, 'case 5 (only the first tick)');
  perform pg_temp.expect_count(bob, 'buddy_done', 1, 'case 5 (closed)');
  select * into n from pg_temp.sent_to(bob, 'buddy_done');
  if n.title <> 'Ada closed out today 🔥' or n.body <> 'Every habit ticked. Your turn?'
     or n.sender_id <> ada or n.data->>'type' <> 'buddy_done' or n.data->>'buddy_id' <> ada::text
     or n.dedupe_key <> 'buddy_done:' || ada || ':' || current_date || ':' || bob then
    raise exception 'case 5: unexpected row %', row_to_json(n);
  end if;
  perform pg_temp.expect_count(ada, null, 0, 'case 5 (actor)');
end $$;

-- 6. All of it in one window is just the day-closed push.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
begin
  perform pg_temp.tick(run);
  perform pg_temp.tick(read);
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, 'buddy_ticked', 0, 'case 6 (no tick push)');
  perform pg_temp.expect_count(bob, 'buddy_done', 1, 'case 6 (closed)');
end $$;

-- 7. The day closes once: untick and re-tick the last habit and nothing more
--    is sent. Closing it by re-ticking a habit already announced still counts.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
begin
  -- Run announced, then unticked; Read announced; Run re-ticked closes it.
  perform pg_temp.tick(run, now() - interval '20 minutes');
  perform pg_temp.run(now() - interval '18 minutes');
  perform pg_temp.untick(run);
  perform pg_temp.tick(read, now() - interval '10 minutes');
  perform pg_temp.run(now() - interval '8 minutes');
  perform pg_temp.tick(run);
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, 'buddy_done', 1, 'case 7 (closed by a re-tick)');

  perform pg_temp.untick(read);
  perform pg_temp.tick(read);
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, 'buddy_done', 1, 'case 7 (once a day)');
  perform pg_temp.expect_count(bob, 'buddy_ticked', 2, 'case 7 (no repeat ticks)');
end $$;

-- 8. A day with nothing due never closes: ticking a habit that isn't due is a
--    tick push with no count to give.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃', pg_temp.not_today());
  n public.notifications;
begin
  perform pg_temp.tick(run);
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, 'buddy_done', 0, 'case 8 (nothing due)');
  select * into n from pg_temp.sent_to(bob);
  if n.title <> 'Ada ticked Run 🏃' or n.body <> 'Extra credit today.' then
    raise exception 'case 8: unexpected wording "%" / "%"', n.title, n.body;
  end if;
end $$;

-- 9. Habits not due today count neither toward the total nor the done.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
  off uuid := pg_temp.mk_goal(ada, g, 'Swim', '🏊', pg_temp.not_today());
  n public.notifications;
begin
  perform pg_temp.tick(run, now() - interval '2 minutes');
  perform pg_temp.tick(off, now() - interval '1 minute');
  perform pg_temp.run();
  select * into n from pg_temp.sent_to(bob);
  if n.title <> 'Ada ticked 2 habits 🏃🏊' or n.body <> '1 of 2 done today' then
    raise exception 'case 9: unexpected wording "%" / "%"', n.title, n.body;
  end if;
end $$;

-- 10. Who hears it: buddies with Social on who are not in quiet hours (their
--     own, in their own timezone). Skipped, not delayed. Nobody outside the
--     group.
do $$
declare
  g uuid := pg_temp.mk_group();
  other uuid := pg_temp.mk_group('Other');
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  off uuid := pg_temp.mk_member(g, 'Cy');
  quiet uuid := pg_temp.mk_member(g, 'Di', 'Asia/Tokyo');
  stranger uuid := pg_temp.mk_member(other, 'Ed');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
  tokyo time := (now() at time zone 'Asia/Tokyo')::time;
begin
  update public.notification_prefs set social_enabled = false where user_id = off;
  update public.notification_prefs
     set quiet_start = tokyo - interval '1 hour', quiet_end = tokyo + interval '1 hour'
   where user_id = quiet;
  perform pg_temp.tick(run);
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, null, 1, 'case 10 (buddy)');
  perform pg_temp.expect_count(off, null, 0, 'case 10 (social off)');
  perform pg_temp.expect_count(quiet, null, 0, 'case 10 (quiet hours)');
  perform pg_temp.expect_count(stranger, null, 0, 'case 10 (other group)');

  -- Quiet hours over: the tick that was skipped stays skipped.
  update public.notification_prefs set quiet_start = null, quiet_end = null where user_id = quiet;
  perform pg_temp.run();
  perform pg_temp.expect_count(quiet, null, 0, 'case 10 (not delayed)');
end $$;

-- 11. Only the last 15 minutes: a check-in older than that (a run missed, or
--     the first run after deploying) is never announced late.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
begin
  perform pg_temp.tick(run, now() - interval '16 minutes');
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, null, 0, 'case 11 (old tick)');
end $$;

-- 12. A habit left behind in a group its owner has since left says nothing.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
begin
  delete from public.group_members where user_id = ada and group_id = g;
  perform pg_temp.tick(run);
  perform pg_temp.run();
  perform pg_temp.expect_count(bob, null, 0, 'case 12');
end $$;

-- 13. No name yet reads "Your buddy".
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, null);
  bob uuid := pg_temp.mk_member(g, 'Bob');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
  n public.notifications;
begin
  perform pg_temp.tick(run);
  perform pg_temp.run();
  select * into n from pg_temp.sent_to(bob);
  if n.title <> 'Your buddy ticked Run 🏃' then
    raise exception 'case 13: unexpected title "%"', n.title;
  end if;
end $$;

-- 14. Someone joining tells the members already there, not the newcomer.
do $$
declare
  g uuid := pg_temp.mk_group('Swole Mates');
  ada uuid := pg_temp.mk_member(g, 'Ada');
  off uuid := pg_temp.mk_member(g, 'Cy');
  bob uuid := pg_temp.mk_member(g, 'Bob Smith', 'UTC', now() - interval '1 minute');
  n public.notifications;
begin
  update public.notification_prefs set social_enabled = false where user_id = off;
  perform pg_temp.run();
  select * into n from pg_temp.sent_to(ada);
  if n.id is null then raise exception 'case 14: no notification'; end if;
  if n.type <> 'member_joined' or n.sender_id <> bob or n.group_id <> g
     or n.title <> 'Bob joined Swole Mates 👋' or n.body <> 'Say hi with a nudge.'
     or n.data->>'type' <> 'member_joined' or n.data->>'buddy_id' <> bob::text
     or n.dedupe_key <> 'member_joined:' || g || ':' || bob || ':' || ada then
    raise exception 'case 14: unexpected row %', row_to_json(n);
  end if;
  perform pg_temp.expect_count(bob, null, 0, 'case 14 (newcomer)');
  perform pg_temp.expect_count(off, null, 0, 'case 14 (social off)');
  perform pg_temp.run();
  perform pg_temp.expect_count(ada, null, 1, 'case 14 (once)');
end $$;

-- 15. Creating a group tells nobody; an old join is not announced late.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada', 'UTC', now() - interval '1 minute');
  h uuid := pg_temp.mk_group();
  cy uuid := pg_temp.mk_member(h, 'Cy');
  di uuid := pg_temp.mk_member(h, 'Di', 'UTC', now() - interval '20 minutes');
begin
  perform pg_temp.run();
  perform pg_temp.expect_count(ada, null, 0, 'case 15 (creator)');
  perform pg_temp.expect_count(cy, null, 0, 'case 15 (old join)');
end $$;

-- 16. It returns exactly the ids it inserted, and nothing on a quiet run.
do $$
declare
  g uuid := pg_temp.mk_group();
  ada uuid := pg_temp.mk_member(g, 'Ada');
  bob uuid := pg_temp.mk_member(g, 'Bob');
  cy uuid := pg_temp.mk_member(g, 'Cy');
  run uuid := pg_temp.mk_goal(ada, g, 'Run', '🏃');
  read uuid := pg_temp.mk_goal(ada, g, 'Read', '📚');
  ids uuid[];
begin
  perform pg_temp.tick(run);
  ids := pg_temp.run();
  if (select array_agg(id order by id) from public.notifications where sender_id = ada)
     is distinct from (select array_agg(i order by i) from unnest(ids) as i)
     or cardinality(ids) <> 2 then
    raise exception 'case 16: returned % for the two rows', ids;
  end if;
  if cardinality(pg_temp.run()) <> 0 then
    raise exception 'case 16: a second run returned ids';
  end if;
end $$;

-- 17. Server only.
do $$
begin
  if has_function_privilege('authenticated', 'public.enqueue_social_events(timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.enqueue_social_events(timestamptz)', 'execute') then
    raise exception 'case 17: callable by a client role';
  end if;
  if not has_function_privilege('service_role', 'public.enqueue_social_events(timestamptz)', 'execute') then
    raise exception 'case 17: not callable by the service role';
  end if;
end $$;

rollback;
