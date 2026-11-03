-- Habit photos (2026-11-03): a live photo on a ticked habit that the group
-- sees until the end of the poster's day. Agreed with Piotr:
--
--   * One photo per habit per day, and it is final: no retake, and a photo
--     that was deleted or unticked away cannot be replaced that day.
--   * The group sees it until the end of the *poster's* local day
--     (`notification_prefs.timezone`), whatever the viewer's timezone.
--   * No tick, no photo: unticking hides it for good, and a photo attached
--     before its tick has synced shows once the tick lands.
--   * Only group-mates (and the poster) can see the row or the file.
--   * The owner may delete their photo; nobody else can.
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/habit_photos.sql
-- Each case raises on failure; everything runs in one transaction that is
-- rolled back, so nothing is left behind.

begin;

create function pg_temp.mk_group()
  returns uuid language sql as $$
  insert into public.groups (name) values ('test') returning id
$$;

create function pg_temp.mk_user(p_name text, p_tz text default 'UTC')
  returns uuid language plpgsql as $$
declare _id uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (_id);
  insert into public.profiles (id, full_name) values (_id, p_name)
    on conflict (id) do update set full_name = excluded.full_name;
  insert into public.notification_prefs (user_id, timezone) values (_id, p_tz)
    on conflict (user_id) do update set timezone = excluded.timezone;
  return _id;
end $$;

create function pg_temp.join(p_group uuid, p_user uuid)
  returns void language sql as $$
  insert into public.group_members (group_id, user_id) values (p_group, p_user)
$$;

create function pg_temp.mk_goal(p_user uuid, p_group uuid, p_title text default 'Run')
  returns uuid language sql as $$
  insert into public.goals (user_id, group_id, title) values (p_user, p_group, p_title) returning id
$$;

-- The owner's local date, the way the app writes `logs.date`.
create function pg_temp.today_of(p_user uuid)
  returns text language sql as $$
  select to_char(now() at time zone timezone, 'YYYY-MM-DD')
    from public.notification_prefs where user_id = p_user
$$;

create function pg_temp.tick(p_user uuid, p_goal uuid, p_day text)
  returns void language sql as $$
  insert into public.logs (goal_id, user_id, date) values (p_goal, p_user, p_day)
$$;

-- What the client uploads before it calls `attach_habit_photo`.
create function pg_temp.upload(p_user uuid, p_goal uuid, p_day text)
  returns text language plpgsql as $$
declare _path text := p_user || '/' || p_goal || '/' || p_day || '/' || gen_random_uuid() || '.jpg';
begin
  insert into storage.objects (bucket_id, name, owner_id) values ('habit-photos', _path, p_user::text);
  return _path;
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

-- Runs a query that returns one value, signed in as `p_user`.
create function pg_temp.scalar_as(p_user uuid, p_sql text)
  returns text language plpgsql as $$
declare _out text;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
  execute p_sql into _out;
  execute 'reset role';
  return _out;
end $$;

create function pg_temp.attach(p_user uuid, p_goal uuid, p_day text, p_path text)
  returns json language plpgsql as $$
begin
  return pg_temp.scalar_as(p_user, format(
    'select public.attach_habit_photo(%L::uuid, %L, %L)::text', p_goal, p_day, p_path))::json;
end $$;

create function pg_temp.remove(p_user uuid, p_photo uuid)
  returns json language plpgsql as $$
begin
  return pg_temp.scalar_as(p_user, format(
    'select public.remove_habit_photo(%L::uuid)::text', p_photo))::json;
end $$;

-- How many photo rows `p_viewer` can see for `p_goal`.
create function pg_temp.sees_row(p_viewer uuid, p_goal uuid)
  returns int language sql as $$
  select pg_temp.scalar_as(p_viewer, format(
    'select count(*) from public.habit_photos where goal_id = %L', p_goal))::int
$$;

-- Whether `p_viewer` can read the file itself (what a signed URL needs).
create function pg_temp.sees_file(p_viewer uuid, p_path text)
  returns int language sql as $$
  select pg_temp.scalar_as(p_viewer, format(
    'select count(*) from storage.objects where bucket_id = %L and name = %L', 'habit-photos', p_path))::int
$$;

create function pg_temp.expect_ok(p_res json, p_case text)
  returns uuid language plpgsql as $$
begin
  if (p_res->>'success')::boolean is not true or p_res->>'photo_id' is null then
    raise exception '%: expected success with an id, got %', p_case, p_res;
  end if;
  return (p_res->>'photo_id')::uuid;
end $$;

create function pg_temp.expect_fail(p_res json, p_message text, p_case text)
  returns void language plpgsql as $$
begin
  if (p_res->>'success')::boolean is distinct from false
     or p_res->>'message' is distinct from p_message then
    raise exception '%: expected failure "%", got %', p_case, p_message, p_res;
  end if;
end $$;

create function pg_temp.expect_eq(p_got anyelement, p_want anyelement, p_case text)
  returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception '%: expected %, got %', p_case, p_want, p_got;
  end if;
end $$;


-- 0. The bucket: private, JPEG only, 2 MB.
do $$
declare b storage.buckets;
begin
  select * into b from storage.buckets where id = 'habit-photos';
  if b.id is null or b.public or b.file_size_limit is distinct from 2097152
     or b.allowed_mime_types is distinct from array['image/jpeg'] then
    raise exception 'bucket: unexpected %', row_to_json(b);
  end if;
end $$;


-- 1. A ticked habit with a photo: the poster and a group-mate see the row and
--    the file; someone from another group sees neither.
do $$
declare g uuid := pg_temp.mk_group(); g2 uuid := pg_temp.mk_group();
        ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo'); cy uuid := pg_temp.mk_user('Cy');
        run uuid; day text; path text; photo uuid; p public.habit_photos;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo); perform pg_temp.join(g2, cy);
  run := pg_temp.mk_goal(ada, g); day := pg_temp.today_of(ada);
  perform pg_temp.tick(ada, run, day);
  path := pg_temp.upload(ada, run, day);
  photo := pg_temp.expect_ok(pg_temp.attach(ada, run, day, path), 'attach');

  select * into p from public.habit_photos where id = photo;
  if p.user_id is distinct from ada or p.goal_id is distinct from run or p.day is distinct from day
     or p.storage_path is distinct from path or p.removed_at is not null then
    raise exception 'attach: unexpected row %', row_to_json(p);
  end if;

  perform pg_temp.expect_eq(pg_temp.sees_row(ada, run), 1, 'poster sees the row');
  perform pg_temp.expect_eq(pg_temp.sees_row(bo, run), 1, 'mate sees the row');
  perform pg_temp.expect_eq(pg_temp.sees_row(cy, run), 0, 'stranger does not see the row');
  perform pg_temp.expect_eq(pg_temp.sees_file(ada, path), 1, 'poster reads the file');
  perform pg_temp.expect_eq(pg_temp.sees_file(bo, path), 1, 'mate reads the file');
  perform pg_temp.expect_eq(pg_temp.sees_file(cy, path), 0, 'stranger cannot read the file');
end $$;


-- 2. No tick, no photo: a photo attached before its tick has synced is
--    accepted but shows nobody anything until the tick lands.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        run uuid; day text; path text;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  run := pg_temp.mk_goal(ada, g); day := pg_temp.today_of(ada);
  path := pg_temp.upload(ada, run, day);
  perform pg_temp.expect_ok(pg_temp.attach(ada, run, day, path), 'attach before tick');
  perform pg_temp.expect_eq(pg_temp.sees_row(bo, run), 0, 'hidden without a tick (mate)');
  perform pg_temp.expect_eq(pg_temp.sees_row(ada, run), 0, 'hidden without a tick (poster)');
  perform pg_temp.expect_eq(pg_temp.sees_file(bo, path), 0, 'file hidden without a tick');

  perform pg_temp.tick(ada, run, day);
  perform pg_temp.expect_eq(pg_temp.sees_row(bo, run), 1, 'shows once the tick lands');
end $$;


-- 3. Unticking removes the photo for good: hidden at once, still hidden after
--    a re-tick, and no second photo that day.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        run uuid; day text; path text; photo uuid;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  run := pg_temp.mk_goal(ada, g); day := pg_temp.today_of(ada);
  perform pg_temp.tick(ada, run, day);
  path := pg_temp.upload(ada, run, day);
  photo := pg_temp.expect_ok(pg_temp.attach(ada, run, day, path), 'attach');

  -- The untick the app sends (as the owner, through RLS).
  perform pg_temp.expect_eq(pg_temp.try_as(ada, format(
    'delete from public.logs where goal_id = %L and user_id = %L and date = %L', run, ada, day)), null::text, 'untick');
  if (select removed_at from public.habit_photos where id = photo) is null then
    raise exception 'untick: photo not marked removed';
  end if;
  perform pg_temp.expect_eq(pg_temp.sees_row(bo, run), 0, 'hidden after untick');

  perform pg_temp.tick(ada, run, day);
  perform pg_temp.expect_eq(pg_temp.sees_row(bo, run), 0, 'still hidden after re-tick');
  perform pg_temp.expect_fail(pg_temp.attach(ada, run, day, pg_temp.upload(ada, run, day)),
    'You''ve already posted a photo for this habit today.', 'no new photo after untick');
end $$;


-- 4. One photo per habit per day: a second upload is refused, while retrying
--    the same upload (a lost response) answers with the photo already there.
--    Another habit, or the same habit another day, takes its own photo.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada');
        run uuid; read uuid; day text; path text; photo uuid;
begin
  perform pg_temp.join(g, ada);
  run := pg_temp.mk_goal(ada, g, 'Run'); read := pg_temp.mk_goal(ada, g, 'Read');
  day := pg_temp.today_of(ada);
  perform pg_temp.tick(ada, run, day);
  path := pg_temp.upload(ada, run, day);
  photo := pg_temp.expect_ok(pg_temp.attach(ada, run, day, path), 'first photo');

  perform pg_temp.expect_fail(pg_temp.attach(ada, run, day, pg_temp.upload(ada, run, day)),
    'You''ve already posted a photo for this habit today.', 'second photo');
  perform pg_temp.expect_eq(pg_temp.expect_ok(pg_temp.attach(ada, run, day, path), 'retry'), photo, 'retry is idempotent');

  perform pg_temp.expect_ok(pg_temp.attach(ada, read, day, pg_temp.upload(ada, read, day)), 'another habit');
  perform pg_temp.expect_ok(pg_temp.attach(ada, run, (day::date - 1)::text,
    pg_temp.upload(ada, run, (day::date - 1)::text)), 'same habit, yesterday');
end $$;


-- 5. The owner may delete their photo, and that is final too; nobody else may.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        run uuid; day text; photo uuid;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  run := pg_temp.mk_goal(ada, g); day := pg_temp.today_of(ada);
  perform pg_temp.tick(ada, run, day);
  photo := pg_temp.expect_ok(pg_temp.attach(ada, run, day, pg_temp.upload(ada, run, day)), 'attach');

  perform pg_temp.expect_fail(pg_temp.remove(bo, photo), 'That photo isn''t yours.', 'mate cannot delete');
  perform pg_temp.expect_eq(pg_temp.sees_row(bo, run), 1, 'still there after a refused delete');

  if (pg_temp.remove(ada, photo)->>'success')::boolean is not true then
    raise exception 'owner delete refused';
  end if;
  perform pg_temp.expect_eq(pg_temp.sees_row(bo, run), 0, 'hidden after delete');
  perform pg_temp.expect_eq(pg_temp.sees_row(ada, run), 0, 'hidden from the owner too');
  if (pg_temp.remove(ada, photo)->>'success')::boolean is not true then
    raise exception 'second delete should be a no-op success';
  end if;
  perform pg_temp.expect_fail(pg_temp.attach(ada, run, day, pg_temp.upload(ada, run, day)),
    'You''ve already posted a photo for this habit today.', 'no retake after delete');
end $$;


-- 6. Refusals: someone else's habit, a path that isn't the caller's folder or
--    doesn't match the habit and day, a file that was never uploaded, a day
--    outside the window `logs` allows, a malformed day.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        run uuid; bos uuid; day text; ghost text;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  run := pg_temp.mk_goal(ada, g); bos := pg_temp.mk_goal(bo, g); day := pg_temp.today_of(ada);

  perform pg_temp.expect_fail(pg_temp.attach(ada, bos, day, pg_temp.upload(ada, bos, day)),
    'That habit isn''t yours.', 'someone else''s habit');
  perform pg_temp.expect_fail(pg_temp.attach(ada, run, day, pg_temp.upload(bo, run, day)),
    'That photo doesn''t match the habit.', 'another user''s folder');
  perform pg_temp.expect_fail(pg_temp.attach(ada, run, day,
    pg_temp.upload(ada, pg_temp.mk_goal(ada, g, 'Read'), day)),
    'That photo doesn''t match the habit.', 'another habit''s folder');
  perform pg_temp.expect_fail(pg_temp.attach(ada, run, day, pg_temp.upload(ada, run, (day::date - 1)::text)),
    'That photo doesn''t match the habit.', 'another day''s folder');
  perform pg_temp.expect_fail(pg_temp.attach(ada, run, day, ada || '/' || run || '/' || day || '/../x.jpg'),
    'That photo doesn''t match the habit.', 'path traversal');

  ghost := ada || '/' || run || '/' || day || '/' || gen_random_uuid() || '.jpg';
  perform pg_temp.expect_fail(pg_temp.attach(ada, run, day, ghost),
    'Couldn''t find that photo. Try again.', 'never uploaded');

  perform pg_temp.expect_fail(pg_temp.attach(ada, run, (current_date - 3)::text,
    pg_temp.upload(ada, run, (current_date - 3)::text)),
    'Too late to add a photo for that day.', 'old day');
  perform pg_temp.expect_fail(pg_temp.attach(ada, run, '2026-13-01', ada || '/' || run || '/2026-13-01/x.jpg'),
    'Too late to add a photo for that day.', 'malformed day');

  perform pg_temp.expect_eq((select count(*)::int from public.habit_photos where goal_id in (run, bos)), 0,
    'nothing written by a refusal');
end $$;


-- 7. The poster's day decides, not the viewer's. Kiritimati (UTC+14) and
--    Pago Pago (UTC-11) are 25 hours apart, so their dates always differ:
--    a photo dated the poster's today shows, one dated a day the poster has
--    already left does not, whatever timezone the viewer is in.
do $$
declare g uuid := pg_temp.mk_group();
        ada uuid := pg_temp.mk_user('Ada', 'Pacific/Kiritimati'); bo uuid := pg_temp.mk_user('Bo', 'Pacific/Pago_Pago');
        run uuid; walk uuid; today text; yesterday text;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  run := pg_temp.mk_goal(ada, g, 'Run'); walk := pg_temp.mk_goal(ada, g, 'Walk');
  today := pg_temp.today_of(ada); yesterday := (today::date - 1)::text;

  perform pg_temp.tick(ada, run, today);
  perform pg_temp.expect_ok(pg_temp.attach(ada, run, today, pg_temp.upload(ada, run, today)), 'today');
  perform pg_temp.tick(ada, walk, yesterday);
  perform pg_temp.expect_ok(pg_temp.attach(ada, walk, yesterday, pg_temp.upload(ada, walk, yesterday)), 'yesterday');

  perform pg_temp.expect_eq(pg_temp.sees_row(bo, run), 1, 'poster''s today shows');
  perform pg_temp.expect_eq(pg_temp.sees_row(bo, walk), 0, 'poster''s yesterday is gone');
  perform pg_temp.expect_eq(pg_temp.sees_row(ada, walk), 0, 'gone for the poster too');

  -- The poster travels: the row follows their current timezone.
  update public.notification_prefs set timezone = 'Pacific/Pago_Pago' where user_id = ada;
  perform pg_temp.expect_eq(pg_temp.sees_row(bo, run), 0, 'not today any more in the new zone');
end $$;


-- 8. Leaving the group takes the photos away from the former mates.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        run uuid; day text; path text;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  run := pg_temp.mk_goal(ada, g); day := pg_temp.today_of(ada);
  perform pg_temp.tick(ada, run, day);
  path := pg_temp.upload(ada, run, day);
  perform pg_temp.expect_ok(pg_temp.attach(ada, run, day, path), 'attach');

  perform pg_temp.scalar_as(ada, 'select public.leave_group()::text');
  perform pg_temp.expect_eq(pg_temp.sees_row(bo, run), 0, 'former mate loses the row');
  perform pg_temp.expect_eq(pg_temp.sees_file(bo, path), 0, 'former mate loses the file');
  perform pg_temp.expect_eq(pg_temp.sees_row(ada, run), 1, 'the poster still sees it');
end $$;


-- 9. No client writes to the table: everything goes through the RPCs.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada');
        run uuid; day text; photo uuid;
begin
  perform pg_temp.join(g, ada);
  run := pg_temp.mk_goal(ada, g); day := pg_temp.today_of(ada);
  perform pg_temp.tick(ada, run, day);
  photo := pg_temp.expect_ok(pg_temp.attach(ada, run, day, pg_temp.upload(ada, run, day)), 'attach');

  perform pg_temp.expect_eq(pg_temp.try_as(ada, format(
    'insert into public.habit_photos (user_id, goal_id, day, storage_path) values (%L, %L, %L, %L)',
    ada, run, (day::date - 1)::text, 'x')), '42501', 'client insert');
  perform pg_temp.expect_eq(pg_temp.try_as(ada, format(
    'update public.habit_photos set removed_at = null where id = %L', photo)), '42501', 'client update');
  perform pg_temp.expect_eq(pg_temp.try_as(ada, format(
    'delete from public.habit_photos where id = %L', photo)), '42501', 'client delete');
end $$;


-- 10. Uploads: into your own folder only.
do $$
declare ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
begin
  perform pg_temp.expect_eq(pg_temp.try_as(ada, format(
    'insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'habit-photos', ada || '/g/2026-01-01/a.jpg', ada)), null::text, 'own folder');
  perform pg_temp.expect_eq(pg_temp.try_as(ada, format(
    'insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'habit-photos', bo || '/g/2026-01-01/a.jpg', ada)), '42501', 'someone else''s folder');
end $$;


-- 11. Deleting the habit takes its photos with it.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada');
        run uuid; day text;
begin
  perform pg_temp.join(g, ada);
  run := pg_temp.mk_goal(ada, g); day := pg_temp.today_of(ada);
  perform pg_temp.tick(ada, run, day);
  perform pg_temp.expect_ok(pg_temp.attach(ada, run, day, pg_temp.upload(ada, run, day)), 'attach');
  delete from public.logs where goal_id = run;
  delete from public.goals where id = run;
  perform pg_temp.expect_eq((select count(*)::int from public.habit_photos where goal_id = run), 0, 'cascade');
end $$;

rollback;
