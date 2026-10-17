-- Who may get into a group and what a member may change (security review,
-- 2026-10-17). Agreed with Piotr:
--
--   * Nobody joins a group without its invite code. The one direct insert left
--     is the creator adding themselves to a group they made, which is the app's
--     "Create group" flow.
--   * One group per person: joining or creating another while you are in one
--     is refused. Leaving still works, and after it the code works again.
--   * Members may rename the group and change its icon. Nobody writes the
--     streak, `creator_id` or the invite code directly; the creator gets a new
--     code from `rotate_invite_code()`. A new group starts with a fresh streak
--     and a generated code.
--   * Names are at most 32 characters, habit titles 60, group names 40.
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/group_access.sql
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

-- Runs `p_sql` signed in as `p_user` and reports the SQLSTATE it failed with,
-- or null when it succeeded. Nothing it does survives a failure.
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
  eve   uuid := pg_temp.mk_user('Eve');
  cal   uuid := pg_temp.mk_user('Cal');
  crew  uuid := pg_temp.mk_group(ada, 'Crew');
  other uuid;
  code  text;
  res   json;
  err   text;
begin
  insert into public.group_members (group_id, user_id) values (crew, bob);
  select invite_code into code from public.groups where id = crew;

  -- 1. An outsider who knows the group's id cannot add themselves to it.
  err := pg_temp.try_as(eve, format(
    'insert into public.group_members (group_id, user_id) values (%L, %L)', crew, eve));
  perform pg_temp.expect(err = '42501', '1: outsider inserted a membership directly');
  perform pg_temp.expect(not exists (select 1 from public.group_members
                                      where group_id = crew and user_id = eve),
                         '1: outsider is a member');

  -- 2. The app's create flow still works: a group, then the creator's own
  --    membership in it.
  err := pg_temp.try_as(cal, format(
    'insert into public.groups (name, creator_id) values (%L, %L)', 'Cal crew', cal));
  perform pg_temp.expect(err is null, '2: creating a group failed: ' || coalesce(err, ''));
  select id into other from public.groups where creator_id = cal;
  err := pg_temp.try_as(cal, format(
    'insert into public.group_members (group_id, user_id) values (%L, %L)', other, cal));
  perform pg_temp.expect(err is null, '2: creator could not join their new group: ' || coalesce(err, ''));

  -- 3. Someone in a group cannot create a second one.
  err := pg_temp.try_as(bob, format(
    'insert into public.groups (name, creator_id) values (%L, %L)', 'Second', bob));
  perform pg_temp.expect(err = '42501', '3: member of a group created a second group');

  -- 4. A new group starts with a fresh streak and a generated code.
  err := pg_temp.try_as(eve, format(
    'insert into public.groups (name, creator_id, current_streak) values (%L, %L, 500)', 'Forged', eve));
  perform pg_temp.expect(err = '42501', '4: group created with a forged streak');
  err := pg_temp.try_as(eve, format(
    'insert into public.groups (name, creator_id, invite_code) values (%L, %L, %L)', 'Weak', eve, 'A'));
  perform pg_temp.expect(err = '42501', '4: group created with a chosen invite code');

  -- 5. Any member renames the group and changes its icon.
  err := pg_temp.try_as(bob, format(
    'update public.groups set name = %L, icon = %L where id = %L', 'Renamed', '🔥', crew));
  perform pg_temp.expect(err is null, '5: member could not rename the group: ' || coalesce(err, ''));
  perform pg_temp.expect((select name = 'Renamed' and icon = '🔥' from public.groups where id = crew),
                         '5: rename did not stick');

  -- 6. Nobody writes the streak, the creator or the code directly, the
  --    creator included.
  err := pg_temp.try_as(bob, format(
    'update public.groups set current_streak = 999 where id = %L', crew));
  perform pg_temp.expect(err = '42501', '6: member set the streak');
  err := pg_temp.try_as(ada, format(
    'update public.groups set last_streak_date = %L where id = %L', '2099-01-01', crew));
  perform pg_temp.expect(err = '42501', '6: creator set last_streak_date');
  err := pg_temp.try_as(bob, format(
    'update public.groups set creator_id = %L where id = %L', bob, crew));
  perform pg_temp.expect(err = '42501', '6: member took over creator_id');
  err := pg_temp.try_as(ada, format(
    'update public.groups set invite_code = %L where id = %L', 'A', crew));
  perform pg_temp.expect(err = '42501', '6: creator set a chosen invite code');
  perform pg_temp.expect((select current_streak = 0 and creator_id = ada and invite_code = code
                            from public.groups where id = crew),
                         '6: a protected column changed');

  -- 7. Only the creator rotates the code, and the old one stops working.
  res := pg_temp.rpc_as(bob, format('select public.rotate_invite_code(%L)', crew));
  perform pg_temp.expect((res->>'success')::boolean is false, '7: member rotated the code');
  perform pg_temp.expect((select invite_code = code from public.groups where id = crew),
                         '7: code changed after a refused rotation');
  res := pg_temp.rpc_as(ada, format('select public.rotate_invite_code(%L)', crew));
  perform pg_temp.expect((res->>'success')::boolean, '7: creator could not rotate the code');
  perform pg_temp.expect((select invite_code = res->>'invite_code' and invite_code <> code
                            and invite_code ~ '^[0-9A-F]{10}$'
                            from public.groups where id = crew),
                         '7: rotated code is not the returned fresh code');
  res := pg_temp.rpc_as(eve, format('select public.join_group_via_code(%L)', code));
  perform pg_temp.expect((res->>'success')::boolean is false, '7: old code still works');
  select invite_code into code from public.groups where id = crew;

  -- 8. The code still lets a newcomer in, and asking again is harmless.
  res := pg_temp.rpc_as(eve, format('select public.join_group_via_code(%L)', lower(code)));
  perform pg_temp.expect((res->>'success')::boolean, '8: newcomer could not join with the code');
  res := pg_temp.rpc_as(eve, format('select public.join_group_via_code(%L)', code));
  perform pg_temp.expect((res->>'success')::boolean, '8: re-joining your own group failed');

  -- 9. One group at a time: Cal, in his own group, cannot join Ada's.
  res := pg_temp.rpc_as(cal, format('select public.join_group_via_code(%L)', code));
  perform pg_temp.expect((res->>'success')::boolean is false
                           and res->>'message' = 'You''re already in a group',
                         '9: joined a second group: ' || res::text);
  perform pg_temp.expect(not exists (select 1 from public.group_members
                                      where group_id = crew and user_id = cal),
                         '9: second membership was written');

  -- 10. Leaving still works, and after it the code does too.
  err := pg_temp.try_as(cal, format(
    'delete from public.group_members where group_id = %L and user_id = %L', other, cal));
  perform pg_temp.expect(err is null, '10: could not leave: ' || coalesce(err, ''));
  res := pg_temp.rpc_as(cal, format('select public.join_group_via_code(%L)', code));
  perform pg_temp.expect((res->>'success')::boolean, '10: could not join after leaving');

  -- 11. A removed member cannot put themselves back.
  err := pg_temp.try_as(ada, format(
    'delete from public.group_members where group_id = %L and user_id = %L', crew, eve));
  perform pg_temp.expect(err is null, '11: creator could not remove a member');
  err := pg_temp.try_as(eve, format(
    'insert into public.group_members (group_id, user_id) values (%L, %L)', crew, eve));
  perform pg_temp.expect(err = '42501', '11: removed member rejoined directly');

  -- 12. Length limits: 32 for a name, 60 for a habit title, 40 for a group.
  err := pg_temp.try_as(bob, format(
    'update public.profiles set full_name = %L where id = %L', repeat('n', 32), bob));
  perform pg_temp.expect(err is null, '12: 32-character name refused');
  err := pg_temp.try_as(bob, format(
    'update public.profiles set full_name = %L where id = %L', repeat('n', 33), bob));
  perform pg_temp.expect(err = '23514', '12: 33-character name accepted');

  err := pg_temp.try_as(bob, format(
    'insert into public.goals (user_id, group_id, title) values (%L, %L, %L)', bob, crew, repeat('t', 60)));
  perform pg_temp.expect(err is null, '12: 60-character habit title refused');
  err := pg_temp.try_as(bob, format(
    'insert into public.goals (user_id, group_id, title) values (%L, %L, %L)', bob, crew, repeat('t', 61)));
  perform pg_temp.expect(err = '23514', '12: 61-character habit title accepted');

  err := pg_temp.try_as(bob, format(
    'update public.groups set name = %L where id = %L', repeat('g', 40), crew));
  perform pg_temp.expect(err is null, '12: 40-character group name refused');
  err := pg_temp.try_as(bob, format(
    'update public.groups set name = %L where id = %L', repeat('g', 41), crew));
  perform pg_temp.expect(err = '23514', '12: 41-character group name accepted');

  -- Counted in code points, and the app's `maxLength` counts UTF-16 units, so
  -- an emoji name the app lets through always fits.
  err := pg_temp.try_as(bob, format(
    'update public.groups set name = %L where id = %L', repeat('🔥', 40), crew));
  perform pg_temp.expect(err is null, '12: 40 emoji refused as a group name');
end $$;

rollback;
