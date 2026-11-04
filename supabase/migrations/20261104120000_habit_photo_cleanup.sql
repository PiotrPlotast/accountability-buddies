-- Habit photo cleanup (2026-11-04). Tested in
-- supabase/tests/habit_photo_cleanup.sql.
--
-- Photos are hidden at read time (`habit_photo_is_visible`), so nothing here
-- has to be on time; this only reclaims what nobody can see any more.
-- Agreed with Piotr:
--
--   * A photo deleted by its poster, or unticked away, loses its file on the
--     next hourly run. Its row stays until the poster's day ends: it is what
--     keeps the day's photo used (a photo is final).
--   * Once the poster's day is over, a photo's file and its row both go.
--   * A file with no row (an upload never attached, a deleted account's
--     photos) goes once it is an hour old, so a post on its way from upload
--     to attach is never caught.
--
-- Hosted Supabase refuses a plain SQL delete on storage.objects, so the
-- database only decides: the `cleanup-habit-photos` Edge Function asks
-- `habit_photo_files_to_delete()` what to delete, removes those files
-- through the Storage API, and reports the ones that went to
-- `finish_habit_photo_cleanup(paths)`. A file the API failed to delete is
-- simply listed again next hour.


-- When the file went, for a removed photo whose row has to outlive it.
alter table public.habit_photos add column file_deleted_at timestamptz;

-- `day` compared with each poster's today on every run.
create index habit_photos_day_idx on public.habit_photos (day);


-- ---------------------------------------------------------------------------
-- habit_photo_files_to_delete() — the files to remove, with why.
-- ---------------------------------------------------------------------------

create or replace function public.habit_photo_files_to_delete(p_limit int default 1000)
  returns table (path text, reason text)
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  (
    -- Rows whose file is still there: removed, or from a day that's over.
    select p.storage_path,
           case when p.removed_at is not null then 'removed' else 'expired' end
      from public.habit_photos p
      left join public.notification_prefs np on np.user_id = p.user_id
     where p.file_deleted_at is null
       and (
         p.removed_at is not null
         or p.day < to_char(now() at time zone coalesce(np.timezone, 'UTC'), 'YYYY-MM-DD')
       )
  )
  union all
  (
    -- Files nothing points at, once they are an hour old.
    select o.name, 'orphan'
      from storage.objects o
     where o.bucket_id = 'habit-photos'
       and o.created_at < now() - interval '1 hour'
       and not exists (
         select 1 from public.habit_photos p where p.storage_path = o.name
       )
  )
  limit p_limit
$function$;

revoke execute on function public.habit_photo_files_to_delete(int) from public, anon, authenticated;
grant  execute on function public.habit_photo_files_to_delete(int) to service_role;


-- ---------------------------------------------------------------------------
-- finish_habit_photo_cleanup(paths) — the files that went. Returns
-- `{ files, rows }`: rows marked as having lost their file, and rows deleted.
-- ---------------------------------------------------------------------------

create or replace function public.finish_habit_photo_cleanup(p_deleted text[])
  returns json
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  _files int;
  _rows int;
begin
  update public.habit_photos
     set file_deleted_at = now()
   where storage_path = any(coalesce(p_deleted, array[]::text[]))
     and file_deleted_at is null;
  get diagnostics _files = row_count;

  -- A finished day's row goes once its file has: an expired photo now, a
  -- photo removed earlier in its day once that day is over.
  delete from public.habit_photos p
   using public.habit_photos p2
    left join public.notification_prefs np on np.user_id = p2.user_id
   where p.id = p2.id
     and p.file_deleted_at is not null
     and p.day < to_char(now() at time zone coalesce(np.timezone, 'UTC'), 'YYYY-MM-DD');
  get diagnostics _rows = row_count;

  return json_build_object('files', _files, 'rows', _rows);
end;
$function$;

revoke execute on function public.finish_habit_photo_cleanup(text[]) from public, anon, authenticated;
grant  execute on function public.finish_habit_photo_cleanup(text[]) to service_role;


-- ---------------------------------------------------------------------------
-- The hourly job, with the same Vault secrets as check-push-receipts
-- (`project_url`, `dispatch_secret`) and the same DISPATCH_SECRET on the
-- function side.
-- ---------------------------------------------------------------------------

select cron.schedule(
  'cleanup-habit-photos',
  '0 * * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/cleanup-habit-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_secret')
    ),
    body    := '{}'::jsonb
  );
  $job$
);
