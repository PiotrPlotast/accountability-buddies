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

-- However a membership row goes (2026-11-16), the habits go with their owner.
-- `leave_group()` always detached them; a row deleted directly, by the member
-- or by the creator removing them, left them pointing at the group.
do $$
declare
  ada  uuid := pg_temp.mk_user('Ada');
  bob  uuid := pg_temp.mk_user('Bob');
  cal  uuid := pg_temp.mk_user('Cal');
  crew uuid := pg_temp.mk_group(ada, 'Crew');
  next uuid := pg_temp.mk_group(pg_temp.mk_user('Dee'), 'Next');
  ada_run uuid;
  bob_run uuid;
  cal_run uuid;
  res  json;
  err  text;
begin
  perform pg_temp.join_at(crew, bob, now() - interval '2 days');
  perform pg_temp.join_at(crew, cal, now() - interval '1 day');
  ada_run := pg_temp.mk_goal(ada, crew, 'Run');
  bob_run := pg_temp.mk_goal(bob, crew, 'Run');
  cal_run := pg_temp.mk_goal(cal, crew, 'Run');

  -- 13. A member deleting their own row takes their habits out of the group.
  err := pg_temp.try_as(bob, format(
    'delete from public.group_members where group_id = %L and user_id = %L', crew, bob));
  perform pg_temp.expect(err is null, '13: could not delete own membership: ' || coalesce(err, ''));
  perform pg_temp.expect((select group_id is null from public.goals where id = bob_run),
                         '13: habit still points at the group its owner left');

  -- 14. So does the creator removing someone.
  err := pg_temp.try_as(ada, format(
    'delete from public.group_members where group_id = %L and user_id = %L', crew, cal));
  perform pg_temp.expect(err is null, '14: creator could not remove a member: ' || coalesce(err, ''));
  perform pg_temp.expect((select group_id is null from public.goals where id = cal_run),
                         '14: a removed member''s habit still points at the group');

  -- 15. Nobody else's habits move, and the group and its creator stay.
  perform pg_temp.expect((select group_id = crew from public.goals where id = ada_run),
                         '15: a remaining member''s habit was detached');
  perform pg_temp.expect((select creator_id = ada from public.groups where id = crew),
                         '15: the group or its creator changed');

  -- 16. The detached habit follows its owner into the next group they join.
  res := pg_temp.rpc_as(bob, format('select public.join_group_via_code(%L)',
                                    (select invite_code from public.groups where id = next)));
  perform pg_temp.expect((res->>'success')::boolean, '16: could not join the next group: ' || res::text);
  perform pg_temp.expect((select group_id = next from public.goals where id = bob_run),
                         '16: habit did not follow its owner');
end $$;

-- A group never outlives its creator's membership (security review,
-- 2026-11-16). Whatever takes a membership row away does what `leave_group()`
-- does: the longest-standing member left becomes the creator, and the last
-- one out deletes the group. Deleting an account is one of those ways.
do $$
declare
  ada   uuid := pg_temp.mk_user('Ada');
  bob   uuid := pg_temp.mk_user('Bob');
  cal   uuid := pg_temp.mk_user('Cal');
  dee   uuid := pg_temp.mk_user('Dee');
  eve   uuid := pg_temp.mk_user('Eve');
  fay   uuid := pg_temp.mk_user('Fay');
  gus   uuid := pg_temp.mk_user('Gus');
  crew  uuid := pg_temp.mk_group(ada, 'Crew');
  duo   uuid := pg_temp.mk_group(dee, 'Duo');
  empty uuid;
  code  text;
  res   json;
  err   text;
begin
  perform pg_temp.join_at(crew, cal, now() - interval '1 day');
  perform pg_temp.join_at(crew, bob, now() - interval '3 days');
  update public.group_members set joined_at = now() - interval '10 days'
   where group_id = crew and user_id = ada;
  perform pg_temp.join_at(duo, eve, now() - interval '1 day');
  update public.group_members set joined_at = now() - interval '5 days'
   where group_id = duo and user_id = dee;

  -- 17. The creator deletes their own membership row: Bob, longest-standing
  --     of those left, becomes the creator. Ada keeps nothing: she can no
  --     longer see the group, rotate its code or remove anyone.
  err := pg_temp.try_as(ada, format(
    'delete from public.group_members where group_id = %L and user_id = %L', crew, ada));
  perform pg_temp.expect(err is null, '17: creator could not delete own membership: ' || coalesce(err, ''));
  perform pg_temp.expect((select creator_id = bob from public.groups where id = crew),
                         '17: creator did not pass to the longest-standing member');
  perform pg_temp.expect(pg_temp.count_as(ada, 'select count(*) from public.groups') = 0,
                         '17: former creator can still see the group');
  res := pg_temp.rpc_as(ada, format('select public.rotate_invite_code(%L)', crew));
  perform pg_temp.expect((res->>'success')::boolean is false, '17: former creator rotated the code');
  perform pg_temp.try_as(ada, format('delete from public.group_members where group_id = %L', crew));
  perform pg_temp.expect((select count(*) = 2 from public.group_members where group_id = crew),
                         '17: former creator removed a member');
  res := pg_temp.rpc_as(bob, format('select public.rotate_invite_code(%L)', crew));
  perform pg_temp.expect((res->>'success')::boolean, '17: new creator could not rotate the code');

  -- 18. Removing someone who is not the creator moves nothing.
  err := pg_temp.try_as(bob, format(
    'delete from public.group_members where group_id = %L and user_id = %L', crew, cal));
  perform pg_temp.expect(err is null, '18: creator could not remove a member: ' || coalesce(err, ''));
  perform pg_temp.expect((select creator_id = bob from public.groups where id = crew),
                         '18: removing a member moved the creator');

  -- 19. The last one out by a direct delete deletes the group, its code stops
  --     working, and a habit someone else left pointing at it is detached.
  select invite_code into code from public.groups where id = crew;
  insert into public.goals (user_id, group_id, title) values (cal, crew, 'Stale');
  err := pg_temp.try_as(bob, format(
    'delete from public.group_members where group_id = %L and user_id = %L', crew, bob));
  perform pg_temp.expect(err is null, '19: last member could not delete own membership: ' || coalesce(err, ''));
  perform pg_temp.expect(not exists (select 1 from public.groups where id = crew),
                         '19: empty group was left behind');
  perform pg_temp.expect((select group_id is null from public.goals where user_id = cal and title = 'Stale'),
                         '19: stale habit was not detached');
  res := pg_temp.rpc_as(cal, format('select public.join_group_via_code(%L)', code));
  perform pg_temp.expect((res->>'success')::boolean is false and res->>'message' = 'Invalid code',
                         '19: dead group''s code still works: ' || res::text);

  -- 20. The creator deletes their account while a buddy remains: the buddy
  --     becomes the creator and can rotate the code.
  err := pg_temp.try_as(dee, 'select public.delete_my_account()');
  perform pg_temp.expect(err is null, '20: could not delete the account: ' || coalesce(err, ''));
  perform pg_temp.expect((select creator_id = eve from public.groups where id = duo),
                         '20: group was left without a creator');
  res := pg_temp.rpc_as(eve, format('select public.rotate_invite_code(%L)', duo));
  perform pg_temp.expect((res->>'success')::boolean, '20: remaining member could not rotate the code');

  -- 21. Deleting the account of the last member deletes the group.
  err := pg_temp.try_as(eve, 'select public.delete_my_account()');
  perform pg_temp.expect(err is null, '21: could not delete the account: ' || coalesce(err, ''));
  perform pg_temp.expect(not exists (select 1 from public.groups where id = duo),
                         '21: empty group was left behind');

  -- 22. A creator who made a group and never joined it deletes their account:
  --     a group others joined goes to its longest-standing member, and one
  --     nobody joined is deleted.
  insert into public.groups (name, creator_id) values ('Fay made', fay) returning id into duo;
  perform pg_temp.join_at(duo, gus, now() - interval '1 day');
  insert into public.groups (name, creator_id) values ('Never joined', fay) returning id into empty;
  err := pg_temp.try_as(fay, 'select public.delete_my_account()');
  perform pg_temp.expect(err is null, '22: could not delete the account: ' || coalesce(err, ''));
  perform pg_temp.expect((select creator_id = gus from public.groups where id = duo),
                         '22: a joined group was left without a creator');
  perform pg_temp.expect(not exists (select 1 from public.groups where id = empty),
                         '22: a group nobody joined was left behind');
end $$;

rollback;
