-- Leaving a group (App Store review readiness, 2026-10-17). Agreed with Piotr:
--
--   * `leave_group()` takes you out of the group you are in. Your buddies stay,
--     and so does the group streak.
--   * Your habits and their history go with you: leaving detaches them, and
--     the next group you join or create picks them up.
--   * The last one out deletes the group, so its invite code stops working.
--   * When the creator leaves, the longest-standing member who is still there
--     becomes the creator, which is what lets them rotate the code.
--   * Nobody is told. Leaving writes no notification.
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/leave_group.sql
-- Each case raises on failure; everything runs in one transaction that is
-- rolled back, so nothing is left behind.

begin;

create function pg_temp.mk_user(p_name text)
  returns uuid language plpgsql as $$
declare _id uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (_id);
  insert into public.profiles (id, full_name) values (_id, p_name)
    on conflict (id) do update set full_name = excluded.full_name;
  return _id;
end $$;

-- A group made the way the app makes one, as the superuser.
create function pg_temp.mk_group(p_creator uuid, p_name text default 'Crew')
  returns uuid language plpgsql as $$
declare _id uuid;
begin
  insert into public.groups (name, creator_id) values (p_name, p_creator) returning id into _id;
  insert into public.group_members (group_id, user_id) values (_id, p_creator);
  return _id;
end $$;

-- Joins `p_group` at a given time, so "longest-standing" has an answer.
create function pg_temp.join_at(p_group uuid, p_user uuid, p_at timestamptz)
  returns void language sql as $$
  insert into public.group_members (group_id, user_id, joined_at) values (p_group, p_user, p_at);
$$;

create function pg_temp.mk_goal(p_user uuid, p_group uuid, p_title text)
  returns uuid language plpgsql as $$
declare _id uuid;
begin
  insert into public.goals (user_id, group_id, title) values (p_user, p_group, p_title)
    returning id into _id;
  return _id;
end $$;

-- Runs `p_sql` signed in as `p_user` and reports the SQLSTATE it failed with,
-- or null when it succeeded.
create function pg_temp.try_as(p_user uuid, p_sql text)
  returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    execute 'reset role';
    return sqlstate;
  end;
  execute 'reset role';
  return null;
end $$;

-- Calls an RPC as `p_user` and returns its json.
create function pg_temp.rpc_as(p_user uuid, p_sql text)
  returns json language plpgsql as $$
declare _out json;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
  execute p_sql into _out;
  execute 'reset role';
  return _out;
end $$;

-- Counts what `p_user` can see through RLS.
create function pg_temp.count_as(p_user uuid, p_sql text)
  returns bigint language plpgsql as $$
declare _n bigint;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
  execute p_sql into _n;
  execute 'reset role';
  return _n;
end $$;

create function pg_temp.expect(p_ok boolean, p_case text)
  returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAILED: %', p_case;
  end if;
end $$;

do $$
declare
  ada   uuid := pg_temp.mk_user('Ada');
  bob   uuid := pg_temp.mk_user('Bob');
  cal   uuid := pg_temp.mk_user('Cal');
  dee   uuid := pg_temp.mk_user('Dee');
  eve   uuid := pg_temp.mk_user('Eve');
  crew  uuid := pg_temp.mk_group(ada, 'Crew');
  other uuid;
  solo  uuid;
  run   uuid;
  code  text;
  res   json;
  err   text;
  notes bigint;
begin
  -- Bob joined before Cal, so Bob is longest-standing after Ada.
  perform pg_temp.join_at(crew, bob, now() - interval '3 days');
  perform pg_temp.join_at(crew, cal, now() - interval '1 day');
  update public.group_members set joined_at = now() - interval '10 days'
   where group_id = crew and user_id = ada;
  update public.groups set current_streak = 7, last_streak_date = current_date
   where id = crew;
  select invite_code into code from public.groups where id = crew;

  run := pg_temp.mk_goal(cal, crew, 'Run');
  insert into public.logs (goal_id, user_id, date)
    values (run, cal, to_char(current_date, 'YYYY-MM-DD'));
  select count(*) into notes from public.notifications;

  -- 1. Someone in no group is told so, and nothing changes.
  res := pg_temp.rpc_as(eve, 'select public.leave_group()');
  perform pg_temp.expect((res->>'success')::boolean is false
                           and res->>'message' = 'You''re not in a group',
                         '1: leaving with no group: ' || res::text);

  -- 2. A member leaves. They are out, everyone else stays, and the group's
  --    streak and creator are untouched.
  res := pg_temp.rpc_as(cal, 'select public.leave_group()');
  perform pg_temp.expect((res->>'success')::boolean, '2: member could not leave: ' || res::text);
  perform pg_temp.expect(not exists (select 1 from public.group_members where user_id = cal),
                         '2: leaver is still a member');
  perform pg_temp.expect((select count(*) = 2 from public.group_members where group_id = crew),
                         '2: other members were removed');
  perform pg_temp.expect((select current_streak = 7 and creator_id = ada
                            from public.groups where id = crew),
                         '2: the streak or the creator changed');

  -- 3. The leaver's habits and their history go with them: detached from the
  --    group, ticks kept.
  perform pg_temp.expect((select group_id is null from public.goals where id = run),
                         '3: habit still belongs to the old group');
  perform pg_temp.expect((select count(*) = 1 from public.logs where goal_id = run),
                         '3: check-ins were lost');

  -- 4. The buddies left behind no longer see them.
  perform pg_temp.expect(pg_temp.count_as(ada, format(
                           'select count(*) from public.goals where user_id = %L', cal)) = 0,
                         '4: a former buddy still sees the leaver''s habits');

  -- 5. Leaving writes no notification.
  perform pg_temp.expect((select count(*) = notes from public.notifications),
                         '5: leaving wrote a notification');

  -- 6. Joining another group by code brings the habits along, history and all.
  other := pg_temp.mk_group(dee, 'Other');
  res := pg_temp.rpc_as(cal, format('select public.join_group_via_code(%L)',
                                    (select invite_code from public.groups where id = other)));
  perform pg_temp.expect((res->>'success')::boolean, '6: could not join after leaving: ' || res::text);
  perform pg_temp.expect((select group_id = other from public.goals where id = run),
                         '6: habit did not move to the new group');
  perform pg_temp.expect((select count(*) = 1 from public.logs where goal_id = run),
                         '6: check-ins were lost on joining');
  perform pg_temp.expect(pg_temp.count_as(dee, format(
                           'select count(*) from public.goals where user_id = %L', cal)) = 1,
                         '6: new buddies cannot see the habit');

  -- 7. Creating a group brings them along too.
  res := pg_temp.rpc_as(cal, 'select public.leave_group()');
  perform pg_temp.expect((res->>'success')::boolean, '7: could not leave the second group');
  err := pg_temp.try_as(cal, format(
    'insert into public.groups (name, creator_id) values (%L, %L)', 'Solo', cal));
  perform pg_temp.expect(err is null, '7: could not create a group: ' || coalesce(err, ''));
  select id into solo from public.groups where creator_id = cal;
  err := pg_temp.try_as(cal, format(
    'insert into public.group_members (group_id, user_id) values (%L, %L)', solo, cal));
  perform pg_temp.expect(err is null, '7: could not join own group: ' || coalesce(err, ''));
  perform pg_temp.expect((select group_id = solo from public.goals where id = run),
                         '7: habit did not move to the created group');

  -- 8. Joining moves only the joiner's habits.
  perform pg_temp.expect((select count(*) = 0 from public.goals
                           where user_id <> cal and group_id = solo),
                         '8: someone else''s habit moved');

  -- 9. The creator leaves: the longest-standing remaining member (Bob, not
  --    Cal, who already left) becomes the creator and can rotate the code.
  res := pg_temp.rpc_as(ada, 'select public.leave_group()');
  perform pg_temp.expect((res->>'success')::boolean, '9: creator could not leave');
  perform pg_temp.expect((select creator_id = bob from public.groups where id = crew),
                         '9: creator did not pass to the longest-standing member');
  res := pg_temp.rpc_as(bob, format('select public.rotate_invite_code(%L)', crew));
  perform pg_temp.expect((res->>'success')::boolean, '9: new creator could not rotate the code');
  select invite_code into code from public.groups where id = crew;

  -- 10. The last one out deletes the group, and its code stops working.
  res := pg_temp.rpc_as(bob, 'select public.leave_group()');
  perform pg_temp.expect((res->>'success')::boolean, '10: last member could not leave');
  perform pg_temp.expect(not exists (select 1 from public.groups where id = crew),
                         '10: empty group was left behind');
  res := pg_temp.rpc_as(eve, format('select public.join_group_via_code(%L)', code));
  perform pg_temp.expect((res->>'success')::boolean is false
                           and res->>'message' = 'Invalid code',
                         '10: dead group''s code still works: ' || res::text);

  -- 11. A group whose last member leaves is deleted even when a habit of
  --     someone who left earlier still points at it.
  perform pg_temp.mk_goal(dee, other, 'Stale');
  insert into public.goals (user_id, group_id, title) values (cal, other, 'Stale too');
  res := pg_temp.rpc_as(dee, 'select public.leave_group()');
  perform pg_temp.expect((res->>'success')::boolean, '11: last member could not leave: ' || res::text);
  perform pg_temp.expect(not exists (select 1 from public.groups where id = other),
                         '11: group with a stale habit was left behind');

  -- 12. Signed-out callers cannot run it at all.
  perform pg_temp.expect(not has_function_privilege('anon', 'public.leave_group()', 'execute'),
                         '12: anon can call leave_group');
end $$;

rollback;
