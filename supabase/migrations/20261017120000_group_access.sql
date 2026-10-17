-- Security review fixes (2026-10-17). Tested in supabase/tests/group_access.sql.
--
--   #1 The "Join groups" insert policy on `group_members` only checked who the
--      row was for, never which group, so anyone who knew a group's id could
--      add themselves to it without the invite code. A member who left or was
--      removed keeps the id, and it rides in every nudge, cheer and social
--      push, so removing someone never kept them out.
--   #2 "members can update group" compared the new row with the old one
--      through subqueries on `groups` itself, which Postgres refuses outright
--      ("infinite recursion detected in policy"). Renaming a group or changing
--      its icon failed for everyone, and so did the creator's code rotation.
--   #3 `authenticated` held every column privilege on `groups`, so the only
--      thing stopping a member from writing `current_streak = 999` was #2.
--      Fixing #2 alone would have opened it. The same grant let a new group
--      start on any streak and with any invite code.
--   #4 Nothing stopped one person joining a second group, after which
--      `get_my_group_stats` showed whichever membership Postgres read first.
--   #5 Names, habit titles and group names had no length limit on the server.
--      They are rendered into push titles, and Expo rejects a payload over
--      4 KB, so one long group name made every push about it fail.
--
-- Agreed with Piotr: no way into a group but the code (or creating it), one
-- group at a time, members rename and re-icon, only the creator gets a new
-- code, 32/60/40-character limits. Leaving and removing a member work as
-- before (20260918120000), and after leaving the code works again.


-- ---------------------------------------------------------------------------
-- One group at a time.
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for the same reason as `is_group_member`: a policy on
-- `group_members` that read `group_members` itself would recurse.
create or replace function public.has_a_group()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select exists (
    select 1 from public.group_members where user_id = (select auth.uid())
  )
$function$;

revoke execute on function public.has_a_group() from public, anon;
grant  execute on function public.has_a_group() to authenticated;


-- ---------------------------------------------------------------------------
-- #1 The only direct way in is the creator joining the group they just made,
-- which is the app's "Create group" (insert the group, then the membership).
-- Everyone else goes through `join_group_via_code`.
-- ---------------------------------------------------------------------------

drop policy if exists "Join groups" on public.group_members;

create policy "Join groups" on public.group_members
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and not public.has_a_group()
    and exists (
      select 1 from public.groups g
       where g.id = group_members.group_id
         and g.creator_id = (select auth.uid())
    )
  );

-- `joined_at` decides who hears about a join, so it is the server's clock.
revoke insert, update on table public.group_members from anon, authenticated;
grant  insert (group_id, user_id) on table public.group_members to authenticated;


-- ---------------------------------------------------------------------------
-- #2 and #3: members may change the name and the icon, nothing else. The
-- streak is the triggers' (`check_daily_streak`, `take_back_daily_streak`),
-- `creator_id` never moves, and the code changes only through
-- `rotate_invite_code()`. A new group gets the column defaults for all of
-- those, and its creator must not already be in a group.
-- ---------------------------------------------------------------------------

drop policy if exists "members can update group" on public.groups;

create policy "members can update group" on public.groups
  for update
  to authenticated
  using (public.is_group_member(id))
  with check (public.is_group_member(id));

drop policy if exists "Create groups" on public.groups;

create policy "Create groups" on public.groups
  for insert
  to authenticated
  with check (
    creator_id = (select auth.uid())
    and not public.has_a_group()
  );

revoke insert, update on table public.groups from anon, authenticated;
grant  insert (name, icon, creator_id) on table public.groups to authenticated;
grant  update (name, icon)             on table public.groups to authenticated;

-- `generate_invite_code()` keeps its `authenticated` grant: it is the
-- `invite_code` default, which runs with the inserting user's privileges.

create or replace function public.rotate_invite_code(p_group uuid)
  returns json
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  new_code text;
begin
  update public.groups
     set invite_code = public.generate_invite_code()
   where id = p_group
     and creator_id = (select auth.uid())
  returning invite_code into new_code;

  if new_code is null then
    return json_build_object('success', false,
      'message', 'Only the person who created the group can change its code');
  end if;

  return json_build_object('success', true, 'invite_code', new_code);
end;
$function$;

revoke execute on function public.rotate_invite_code(uuid) from public, anon;
grant  execute on function public.rotate_invite_code(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- #4 Joining by code refuses someone already in another group. Asking again
-- for the group you are in still succeeds, as before. Otherwise unchanged
-- from 20260918120000.
-- ---------------------------------------------------------------------------

create or replace function public.join_group_via_code(code_input text)
  returns json
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  target_group_id uuid;
  my_id uuid := auth.uid();
begin
  if my_id is null then
    return json_build_object('success', false, 'message', 'Not signed in');
  end if;

  -- Case-insensitive and trimmed: the join screen uppercases what you type,
  -- and a pasted code arrives with whatever whitespace came with it.
  select id into target_group_id
    from public.groups
   where upper(invite_code) = upper(trim(code_input));

  if target_group_id is null then
    return json_build_object('success', false, 'message', 'Invalid code');
  end if;

  if exists (select 1 from public.group_members
              where user_id = my_id and group_id <> target_group_id) then
    return json_build_object('success', false, 'message', 'You''re already in a group');
  end if;

  insert into public.group_members (group_id, user_id)
  values (target_group_id, my_id)
  on conflict do nothing; -- Ignore if already inside

  return json_build_object('success', true, 'group_id', target_group_id);
end;
$function$;


-- ---------------------------------------------------------------------------
-- #5 Length limits, in characters (code points). The app's `maxLength` counts
-- UTF-16 units, so anything it lets through fits. NOT VALID: rows already
-- over the limit stay readable, and only new writes are checked.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_full_name_length check (char_length(full_name) <= 32) not valid;

alter table public.goals
  add constraint goals_title_length check (char_length(title) <= 60) not valid;

alter table public.groups
  add constraint groups_name_length check (char_length(name) <= 40) not valid;

-- Sign-up copies a name from the identity provider's metadata, which may be
-- longer than the limit; a long name must not make sign-up fail.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, left(new.raw_user_meta_data->>'full_name', 32), new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$function$;
