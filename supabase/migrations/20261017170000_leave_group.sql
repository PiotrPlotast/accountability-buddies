-- Leave group (App Store review readiness, 2026-10-17). Tested in
-- supabase/tests/leave_group.sql.
--
-- Agreed with Piotr: leaving takes you out of your group and leaves your
-- buddies and the group streak alone; your habits and their history go with
-- you into the next group you join or create; the last one out deletes the
-- group, so its code stops working; when the creator leaves, the
-- longest-standing member still there becomes the creator (which is what lets
-- someone rotate the code); nobody is notified.
--
-- The "Leave or remove from group" delete policy (20260918120000) already let
-- a member delete their own row. It stays, for the creator removing someone,
-- but the app leaves through `leave_group()` so the clean-up happens in the
-- same transaction as the delete.


-- ---------------------------------------------------------------------------
-- Habits follow their owner. `goals.group_id` is what `useGroupMembers`
-- filters on, so a habit left pointing at an old group would vanish the
-- moment its owner joined a new one. A new membership takes the joiner's
-- habits with it, whichever way the row arrives (`join_group_via_code`, or
-- the creator joining the group they just made).
-- ---------------------------------------------------------------------------

create or replace function public.move_goals_to_new_group()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
begin
  update public.goals
     set group_id = new.group_id
   where user_id = new.user_id
     and group_id is distinct from new.group_id;
  return new;
end;
$function$;

revoke execute on function public.move_goals_to_new_group() from public, anon, authenticated;

drop trigger if exists move_goals_to_new_group on public.group_members;

create trigger move_goals_to_new_group
  after insert on public.group_members
  for each row execute function public.move_goals_to_new_group();


-- ---------------------------------------------------------------------------
-- leave_group()
-- ---------------------------------------------------------------------------

create or replace function public.leave_group()
  returns json
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  my_id uuid := auth.uid();
  gid uuid;
  heir uuid;
begin
  if my_id is null then
    return json_build_object('success', false, 'message', 'Not signed in');
  end if;

  -- One group at a time since 20261017120000, but a loop costs nothing and
  -- also clears a second membership written before that rule existed.
  for gid in
    select group_id from public.group_members where user_id = my_id
  loop
    delete from public.group_members where group_id = gid and user_id = my_id;

    -- Detached rather than deleted: they come back with you on your next join.
    update public.goals set group_id = null
     where group_id = gid and user_id = my_id;

    select user_id into heir
      from public.group_members
     where group_id = gid
     order by joined_at asc nulls last, id asc
     limit 1;

    if heir is null then
      -- Last one out. Any habit still pointing here belongs to someone who
      -- left before this function existed; `goals.group_id` is NO ACTION, so
      -- detach it before dropping the group (as `delete_my_account` does).
      update public.goals set group_id = null where group_id = gid;
      delete from public.groups where id = gid;
    else
      update public.groups set creator_id = heir
       where id = gid and creator_id = my_id;
    end if;
  end loop;

  if gid is null then
    return json_build_object('success', false, 'message', 'You''re not in a group');
  end if;

  return json_build_object('success', true);
end;
$function$;

revoke execute on function public.leave_group() from public, anon;
grant  execute on function public.leave_group() to authenticated;
