-- E2 PR 3 — delete my account.
--
-- Apple requires in-app account deletion of any app that lets people create
-- accounts, which email sign-up already does. This is the whole path.
--
-- SECURITY DEFINER for two reasons, not one:
--   * `auth.users` is unreachable from the client at any privilege level;
--   * `group_members`, `groups` and `profiles` carry no DELETE policy at all
--     (see 20260826172058_initial_schema.sql), so even the rows the user
--     plainly owns cannot be removed under RLS.
-- Everything the function touches is keyed off `auth.uid()`, never off an
-- argument — the function takes none, so there is no id for a caller to swap.
--
-- Deletion order matters because almost nothing cascades. `logs -> goals` is
-- the only ON DELETE CASCADE in the schema; `goals.user_id`,
-- `group_members.user_id`, `logs.user_id`, `groups.creator_id` and
-- `profiles.id -> auth.users.id` are all NO ACTION. A plain
-- `delete from auth.users` therefore fails on a foreign key.

create or replace function public.delete_my_account()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  my_id uuid := auth.uid();
  my_groups uuid[];
  gid uuid;
begin
  if my_id is null then
    raise exception 'Not signed in';
  end if;

  -- Every group this account has a stake in, gathered *before* the membership
  -- rows go. The union covers a group created but never joined — group
  -- creation is two statements in `join-group.tsx` (insert the group, then the
  -- membership), so a half-failed create leaves exactly that shape behind.
  select coalesce(array_agg(id), '{}')
    into my_groups
    from (
      select group_id as id from public.group_members where user_id = my_id
      union
      select id from public.groups where creator_id = my_id
    ) s;

  -- Own check-ins first. `logs -> goals` cascades, so the second statement
  -- would carry these anyway; doing it explicitly keeps the function correct
  -- if a log ever points at a goal that is not the user's own.
  delete from public.logs where user_id = my_id;
  delete from public.goals where user_id = my_id;

  delete from public.group_members where user_id = my_id;

  foreach gid in array my_groups loop
    if exists (select 1 from public.group_members where group_id = gid) then
      -- Buddies remain. `creator_id` grants no powers worth transferring: it
      -- appears only in the "Create groups" insert check and in "See my
      -- groups", which lets a creator see a group they are not a member of.
      -- There is no owner role, so null it and leave the group alone.
      update public.groups set creator_id = null
        where id = gid and creator_id = my_id;
    else
      -- Last one out. An empty group is deleted rather than left behind,
      -- because an orphaned row keeps a working invite code pointing at a
      -- dead room.
      --
      -- `goals.group_id` is NO ACTION and nullable, and a goal belonging to
      -- someone who left this group earlier still points at it — that row
      -- would block the delete. Detach before dropping the group.
      update public.goals set group_id = null where group_id = gid;
      delete from public.groups where id = gid;
    end if;
  end loop;

  -- `profiles.id -> auth.users.id` does not cascade, so the profile has to go
  -- first or the next statement fails on that constraint.
  delete from public.profiles where id = my_id;
  delete from auth.users where id = my_id;
end;
$function$;

-- Postgres grants EXECUTE to PUBLIC by default and anon inherits from it, so
-- revoke from PUBLIC before granting back — the same pattern as
-- 20260826174500_security_fixes_execute_grants.sql. An anon caller has no
-- `auth.uid()` and would only ever hit the "Not signed in" exception, but the
-- function has no business on the anon REST surface at all.
revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;
