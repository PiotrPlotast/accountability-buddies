-- Habit photos (2026-11-03). Tested in supabase/tests/habit_photos.sql.
--
-- A live photo on a ticked habit, which the group sees until the end of the
-- poster's day. Agreed with Piotr:
--
--   * One photo per habit per day, and it is final: no retake, and a photo
--     that was deleted or unticked away cannot be replaced that day.
--   * The group sees it until the end of the *poster's* local day
--     (`notification_prefs.timezone`), whatever the viewer's timezone.
--   * No tick, no photo: unticking hides it for good.
--   * Only the poster and their group-mates can see the row or the file.
--     The poster also sees their own removed or not-yet-ticked row for
--     today, which is how the app knows the day's photo is used up.
--
-- Its own table rather than a column on `logs`: an untick deletes the log row,
-- which would lose track of the file, and a photo may be attached before a
-- tick queued offline has reached the server. Visibility is decided here, at
-- read time, so expiry needs no job to be on time; a later cleanup job only
-- reclaims the files of rows nobody can see any more.
--
-- The client uploads the file to the `habit-photos` bucket first, under
-- `<user>/<goal>/<day>/<uuid>.jpg`, then calls `attach_habit_photo`, which
-- checks the path against the habit and writes the row. There is no client
-- write path to the table.


-- ---------------------------------------------------------------------------
-- habit_photos
-- ---------------------------------------------------------------------------

create table public.habit_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  goal_id      uuid not null references public.goals (id) on delete cascade,
  -- The log's `YYYY-MM-DD`, in the poster's timezone, as `logs.date` is.
  day          text not null
               check (day ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'),
  storage_path text not null unique,
  created_at   timestamptz not null default now(),
  -- Set by an untick or a delete. The row stays, so the slot stays used: the
  -- unique constraint below is what makes a photo final.
  removed_at   timestamptz,
  constraint habit_photos_one_per_habit_per_day unique (goal_id, user_id, day)
);

-- The foreign key to `auth.users` (account deletion cascades through it).
create index habit_photos_user_id_day_idx on public.habit_photos (user_id, day);

alter table public.habit_photos enable row level security;

-- The default privileges hand every new table to anon and authenticated in
-- full. Reading is all the client does; the RPCs below write.
revoke all on table public.habit_photos from anon, authenticated;
grant select on table public.habit_photos to authenticated;


-- Whether the caller may see this photo right now. SECURITY DEFINER because
-- the answer needs the poster's timezone, and `notification_prefs` is only
-- readable by its owner. It takes a photo id, never a user, so all it can
-- tell anyone is a yes or no about a photo.
create or replace function public.habit_photo_is_visible(p_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select exists (
    select 1
      from public.habit_photos p
      left join public.notification_prefs np on np.user_id = p.user_id
     where p.id = p_id
       -- Until the end of the poster's day.
       and p.day = to_char(now() at time zone coalesce(np.timezone, 'UTC'), 'YYYY-MM-DD')
       and (
         -- The poster sees their own row for today whatever its state: a
         -- removed photo, or one whose tick hasn't landed, still uses up the
         -- day's photo, and the app needs to know that to hide the camera.
         p.user_id = (select auth.uid())
         or (
           p.removed_at is null
           -- No tick, no photo.
           and exists (
             select 1 from public.logs l
              where l.goal_id = p.goal_id and l.user_id = p.user_id and l.date = p.day
           )
           and exists (
             select 1
               from public.group_members mine
               join public.group_members theirs on theirs.group_id = mine.group_id
              where mine.user_id = (select auth.uid())
                and theirs.user_id = p.user_id
           )
         )
       )
  )
$function$;

revoke execute on function public.habit_photo_is_visible(uuid) from public, anon;
grant  execute on function public.habit_photo_is_visible(uuid) to authenticated;

create policy "See today's group photos" on public.habit_photos
  for select
  to authenticated
  using (public.habit_photo_is_visible(id));


-- ---------------------------------------------------------------------------
-- An untick takes the photo with it, including an untick queued offline that
-- arrives later. The client's toggle needs to know nothing about photos.
-- ---------------------------------------------------------------------------

create or replace function public.remove_habit_photo_on_untick()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
begin
  update public.habit_photos
     set removed_at = now()
   where goal_id = old.goal_id
     and user_id = old.user_id
     and day = old.date
     and removed_at is null;
  return old;
end;
$function$;

revoke execute on function public.remove_habit_photo_on_untick() from public, anon, authenticated;

create trigger remove_habit_photo_on_untick
  after delete on public.logs
  for each row execute function public.remove_habit_photo_on_untick();


-- ---------------------------------------------------------------------------
-- attach_habit_photo(goal, day, path)
--
-- Returns `{ success, message, photo_id }` like `enqueue_nudge`. A retry of
-- the same path (a lost response) answers with the photo already written.
-- ---------------------------------------------------------------------------

create or replace function public.attach_habit_photo(p_goal uuid, p_day text, p_path text)
  returns json
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  my_id uuid := auth.uid();
  _existing public.habit_photos;
  _id uuid;
begin
  if my_id is null then
    return json_build_object('success', false, 'message', 'Not signed in.');
  end if;

  if not exists (select 1 from public.goals where id = p_goal and user_id = my_id) then
    return json_build_object('success', false, 'message', 'That habit isn''t yours.');
  end if;

  -- The same window `logs` allows: the client sends its own local date, a
  -- day either side of the server's. Checked by shape first, so a malformed
  -- day is a refusal rather than a cast error.
  if p_day is null
     or p_day !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
     or p_day::date not between current_date - 1 and current_date + 1 then
    return json_build_object('success', false, 'message', 'Too late to add a photo for that day.');
  end if;

  -- `<user>/<goal>/<day>/<uuid>.jpg` exactly: the upload policy only checks
  -- the first folder, so this is what ties a file to the habit and the day.
  if p_path is null
     or p_path !~ ('^' || my_id || '/' || p_goal || '/' || p_day
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') then
    return json_build_object('success', false, 'message', 'That photo doesn''t match the habit.');
  end if;

  if not exists (select 1 from storage.objects where bucket_id = 'habit-photos' and name = p_path) then
    return json_build_object('success', false, 'message', 'Couldn''t find that photo. Try again.');
  end if;

  insert into public.habit_photos (user_id, goal_id, day, storage_path)
  values (my_id, p_goal, p_day, p_path)
  on conflict (goal_id, user_id, day) do nothing
  returning id into _id;

  if _id is null then
    select * into _existing
      from public.habit_photos
     where goal_id = p_goal and user_id = my_id and day = p_day;
    if _existing.storage_path = p_path and _existing.removed_at is null then
      _id := _existing.id;
    else
      return json_build_object('success', false,
        'message', 'You''ve already posted a photo for this habit today.');
    end if;
  end if;

  return json_build_object('success', true, 'message', 'Photo posted.', 'photo_id', _id);
end;
$function$;

revoke execute on function public.attach_habit_photo(uuid, text, text) from public, anon;
grant  execute on function public.attach_habit_photo(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- remove_habit_photo(photo) — the owner deleting their photo. Final, like an
-- untick: the slot stays used for the day. Removing one already removed is a
-- success, so a double tap does not raise an Alert.
-- ---------------------------------------------------------------------------

create or replace function public.remove_habit_photo(p_id uuid)
  returns json
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  my_id uuid := auth.uid();
begin
  if my_id is null then
    return json_build_object('success', false, 'message', 'Not signed in.');
  end if;

  if not exists (select 1 from public.habit_photos where id = p_id and user_id = my_id) then
    return json_build_object('success', false, 'message', 'That photo isn''t yours.');
  end if;

  update public.habit_photos
     set removed_at = now()
   where id = p_id and removed_at is null;

  return json_build_object('success', true, 'message', 'Photo deleted.');
end;
$function$;

revoke execute on function public.remove_habit_photo(uuid) from public, anon;
grant  execute on function public.remove_habit_photo(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Storage: a private bucket, JPEG only (the client compresses to JPEG), 2 MB.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('habit-photos', 'habit-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Into your own folder only. What the rest of the path means is checked by
-- `attach_habit_photo`; a file nobody attaches is reclaimed by the cleanup.
create policy "Upload own habit photos" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'habit-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- A file is readable (and so can be signed) exactly when its row is: the
-- subquery runs under the table's own policy.
create policy "Read visible habit photos" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'habit-photos'
    and exists (select 1 from public.habit_photos p where p.storage_path = objects.name)
  );

-- Your own files only. Lets the client take back an upload that
-- `attach_habit_photo` refused, rather than leaving it for the cleanup.
create policy "Delete own habit photos" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'habit-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
