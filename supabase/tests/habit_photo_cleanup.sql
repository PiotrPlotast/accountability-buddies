-- Habit photo cleanup (2026-11-04): what the hourly `cleanup-habit-photos`
-- job deletes. Agreed with Piotr:
--
--   * A photo deleted by its poster, or unticked away, loses its file on the
--     next run. Its row stays until the poster's day ends: it is what keeps
--     the day's photo used (a photo is final).
--   * Once the poster's day is over, a photo's file and its row both go.
--   * A file with no row (an upload never attached, a deleted account's
--     photos) goes once it is an hour old.
--
-- The database decides and the Edge Function deletes the files through the
-- Storage API (a plain SQL delete on storage.objects is refused):
-- `habit_photo_files_to_delete()` lists them, and
-- `finish_habit_photo_cleanup(paths)` is told which ones are gone.
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/habit_photo_cleanup.sql
-- Each case raises on failure; everything runs in one transaction that is
-- rolled back, so nothing is left behind.

begin;

create function pg_temp.mk_user(p_tz text default 'UTC')
  returns uuid language plpgsql as $$
declare _id uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (_id);
  insert into public.profiles (id, full_name) values (_id, 'Ada')
    on conflict (id) do update set full_name = excluded.full_name;
  insert into public.notification_prefs (user_id, timezone) values (_id, p_tz)
    on conflict (user_id) do update set timezone = excluded.timezone;
  return _id;
end $$;

create function pg_temp.mk_goal(p_user uuid)
  returns uuid language plpgsql as $$
declare g uuid; goal uuid;
begin
  insert into public.groups (name) values ('test') returning id into g;
  insert into public.group_members (group_id, user_id) values (g, p_user);
  insert into public.goals (user_id, group_id, title) values (p_user, g, 'Run') returning id into goal;
  return goal;
end $$;

-- The poster's local date, the way the app writes `logs.date`.
create function pg_temp.today_of(p_user uuid)
  returns text language sql as $$
  select to_char(now() at time zone timezone, 'YYYY-MM-DD')
    from public.notification_prefs where user_id = p_user
$$;

create function pg_temp.shift(p_day text, p_days int)
  returns text language sql as $$
  select to_char(p_day::date + p_days, 'YYYY-MM-DD')
$$;

create function pg_temp.upload(p_path text, p_age interval default interval '2 hours')
  returns text language sql as $$
  insert into storage.objects (bucket_id, name, created_at)
  values ('habit-photos', p_path, now() - p_age)
  returning name
$$;

-- A photo row with its file, as attach_habit_photo leaves them.
create function pg_temp.photo(p_user uuid, p_goal uuid, p_day text, p_removed boolean default false)
  returns text language plpgsql as $$
declare _path text := p_user || '/' || p_goal || '/' || p_day || '/' || gen_random_uuid() || '.jpg';
begin
  perform pg_temp.upload(_path);
  insert into public.habit_photos (user_id, goal_id, day, storage_path, removed_at)
  values (p_user, p_goal, p_day, _path, case when p_removed then now() end);
  return _path;
end $$;

create function pg_temp.listed()
  returns table (path text, reason text) language sql as $$
  select path, reason from public.habit_photo_files_to_delete()
$$;

create function pg_temp.reason_for(p_path text)
  returns text language sql as $$
  select reason from pg_temp.listed() where path = p_path
$$;

create function pg_temp.expect_eq(p_got anyelement, p_want anyelement, p_case text)
  returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception '%: expected %, got %', p_case, p_want, p_got;
  end if;
end $$;

-- Runs `p_sql` as `p_role` and reports the SQLSTATE it failed with, or null.
create function pg_temp.try_as_role(p_role text, p_sql text)
  returns text language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    execute 'reset role';
    return sqlstate;
  end;
  execute 'reset role';
  return null;
end $$;


-- 1. A live photo of today is left alone.
do $$
declare ada uuid := pg_temp.mk_user(); run uuid := pg_temp.mk_goal(ada); path text;
begin
  path := pg_temp.photo(ada, run, pg_temp.today_of(ada));
  perform pg_temp.expect_eq(pg_temp.reason_for(path), null::text, 'live photo of today');
end $$;


-- 2. A photo removed today: its file is listed now; once deleted, the row
--    stays (the day's photo is still used) and nothing is listed again.
do $$
declare ada uuid := pg_temp.mk_user(); run uuid := pg_temp.mk_goal(ada); today text; path text; res json;
begin
  today := pg_temp.today_of(ada);
  path := pg_temp.photo(ada, run, today, true);
  perform pg_temp.expect_eq(pg_temp.reason_for(path), 'removed', 'removed photo listed');

  res := public.finish_habit_photo_cleanup(array[path]);
  perform pg_temp.expect_eq((res->>'files')::int, 1, 'one file recorded');
  perform pg_temp.expect_eq((res->>'rows')::int, 0, 'no row deleted today');

  if (select file_deleted_at from public.habit_photos where storage_path = path) is null then
    raise exception 'removed photo: file not recorded as deleted';
  end if;
  perform pg_temp.expect_eq(pg_temp.reason_for(path), null::text, 'not listed again');
  perform pg_temp.expect_eq(
    (select count(*)::int from public.habit_photos where goal_id = run and day = today), 1,
    'the row keeps the day''s photo used');
end $$;


-- 3. A photo whose day is over: file listed; once deleted, the row goes too.
do $$
declare ada uuid := pg_temp.mk_user(); run uuid := pg_temp.mk_goal(ada); path text; res json;
begin
  path := pg_temp.photo(ada, run, pg_temp.shift(pg_temp.today_of(ada), -1));
  perform pg_temp.expect_eq(pg_temp.reason_for(path), 'expired', 'yesterday''s photo listed');

  res := public.finish_habit_photo_cleanup(array[path]);
  perform pg_temp.expect_eq((res->>'rows')::int, 1, 'its row deleted');
  perform pg_temp.expect_eq(
    (select count(*)::int from public.habit_photos where storage_path = path), 0, 'row gone');
end $$;


-- 4. A removed photo whose file already went on an earlier run loses its row
--    once its day is over, without being listed again.
do $$
declare ada uuid := pg_temp.mk_user(); run uuid := pg_temp.mk_goal(ada); path text;
begin
  path := pg_temp.photo(ada, run, pg_temp.shift(pg_temp.today_of(ada), -1), true);
  update public.habit_photos set file_deleted_at = now() - interval '1 day' where storage_path = path;
  perform pg_temp.expect_eq(pg_temp.reason_for(path), null::text, 'file already gone, not listed');

  perform public.finish_habit_photo_cleanup(array[]::text[]);
  perform pg_temp.expect_eq(
    (select count(*)::int from public.habit_photos where storage_path = path), 0,
    'row of a finished day goes once its file is gone');
end $$;


-- 5. A file the Storage API failed to delete keeps its row, and is listed
--    again on the next run.
do $$
declare ada uuid := pg_temp.mk_user(); run uuid := pg_temp.mk_goal(ada); path text;
begin
  path := pg_temp.photo(ada, run, pg_temp.shift(pg_temp.today_of(ada), -1));
  perform public.finish_habit_photo_cleanup(array[]::text[]);
  perform pg_temp.expect_eq(
    (select count(*)::int from public.habit_photos where storage_path = path), 1,
    'row kept while its file is still there');
  perform pg_temp.expect_eq(pg_temp.reason_for(path), 'expired', 'listed again');
end $$;


-- 6. The poster's day decides. Pago Pago (UTC-11) is always at least a day
--    behind Kiritimati (UTC+14): a photo dated Pago Pago's today is live for
--    a poster there, and one dated Kiritimati's yesterday has expired for a
--    poster there, whatever the server's own date.
do $$
declare west uuid := pg_temp.mk_user('Pacific/Pago_Pago'); east uuid := pg_temp.mk_user('Pacific/Kiritimati');
        p_west text; p_east text;
begin
  p_west := pg_temp.photo(west, pg_temp.mk_goal(west), pg_temp.today_of(west));
  p_east := pg_temp.photo(east, pg_temp.mk_goal(east), pg_temp.shift(pg_temp.today_of(east), -1));
  perform pg_temp.expect_eq(pg_temp.reason_for(p_west), null::text, 'still today for the poster');
  perform pg_temp.expect_eq(pg_temp.reason_for(p_east), 'expired', 'over for the poster');
end $$;


-- 7. Files with no row: listed once they are an hour old. A file on its way
--    to being attached (just uploaded) is never caught, and a photo's own
--    file is never an orphan.
do $$
declare ada uuid := pg_temp.mk_user(); run uuid := pg_temp.mk_goal(ada);
        old_orphan text; new_orphan text; attached text;
begin
  old_orphan := pg_temp.upload(ada || '/x/2026-11-01/' || gen_random_uuid() || '.jpg', interval '61 minutes');
  new_orphan := pg_temp.upload(ada || '/x/2026-11-04/' || gen_random_uuid() || '.jpg', interval '10 minutes');
  attached := pg_temp.photo(ada, run, pg_temp.today_of(ada));

  perform pg_temp.expect_eq(pg_temp.reason_for(old_orphan), 'orphan', 'hour-old stray');
  perform pg_temp.expect_eq(pg_temp.reason_for(new_orphan), null::text, 'upload in progress');
  perform pg_temp.expect_eq(pg_temp.reason_for(attached), null::text, 'attached file');
end $$;


-- 8. A deleted account's photos: the rows cascade away, and the files are
--    collected as orphans.
do $$
declare ada uuid := pg_temp.mk_user(); run uuid := pg_temp.mk_goal(ada); path text;
begin
  path := pg_temp.photo(ada, run, pg_temp.today_of(ada));
  -- The way an account goes: the app's Delete account.
  perform set_config('request.jwt.claim.sub', ada::text, true);
  perform public.delete_my_account();
  perform pg_temp.expect_eq(pg_temp.reason_for(path), 'orphan', 'deleted account''s file');
end $$;


-- 9. Files in other buckets are never listed.
do $$
declare path text := 'avatars/' || gen_random_uuid() || '.jpg';
begin
  insert into storage.buckets (id, name) values ('avatars-test', 'avatars-test') on conflict do nothing;
  insert into storage.objects (bucket_id, name, created_at) values ('avatars-test', path, now() - interval '2 days');
  perform pg_temp.expect_eq(pg_temp.reason_for(path), null::text, 'another bucket');
end $$;


-- 10. The service role only: the app can't list or forget photos.
do $$
begin
  perform pg_temp.expect_eq(pg_temp.try_as_role('authenticated',
    'select * from public.habit_photo_files_to_delete()'), '42501', 'authenticated cannot list');
  perform pg_temp.expect_eq(pg_temp.try_as_role('authenticated',
    'select public.finish_habit_photo_cleanup(array[]::text[])'), '42501', 'authenticated cannot finish');
  perform pg_temp.expect_eq(pg_temp.try_as_role('service_role',
    'select * from public.habit_photo_files_to_delete()'), null::text, 'service role lists');
end $$;


-- 11. The hourly job is scheduled and posts to the Edge Function.
do $$
declare j cron.job;
begin
  select * into j from cron.job where jobname = 'cleanup-habit-photos';
  if j.jobname is null then raise exception 'cron: job missing'; end if;
  perform pg_temp.expect_eq(j.schedule, '0 * * * *', 'cron: hourly');
  if position('/functions/v1/cleanup-habit-photos' in j.command) = 0 then
    raise exception 'cron: posts to the wrong function: %', j.command;
  end if;
end $$;

rollback;
