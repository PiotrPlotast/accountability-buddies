-- Security review fixes (2026-11-16), second part. Tested in
-- supabase/tests/leave_group.sql (cases 17 to 22) and
-- supabase/tests/group_access.sql (case 13).
--
--   #3 A group could end up with no creator, or with a creator who was not
--      in it. `delete_my_account` set `creator_id` to null when buddies
--      remained, and a creator who deleted their own membership row directly
--      kept `creator_id`. Only the creator can rotate the invite code or
--      remove a member, so the first left a leaked code unrevocable for good,
--      and the second left those powers with someone outside the group.
--      `leave_group()` got this right; nothing else did.
--   #4 One group per person was checked but not enforced. `join_group_via_code`
--      and the "Join groups" policy both read `group_members` before writing
--      to it, so two joins sent at the same moment each saw no membership and
--      both went in.
--
-- Agreed with Piotr:
--
--   * Whatever takes a membership row away does what `leave_group()` does:
--     the longest-standing member left becomes the creator, and the last one
--     out deletes the group, so its code stops working. Account deletion is
--     one of those ways.
--   * Groups that already have members but no creator among them get their
--     longest-standing member as creator. Groups with no members are left
--     alone: a create that has not finished looks like that.
--   * One membership per person is a constraint. Anyone already in two groups
--     keeps the one they joined last, where their habits already are, and
--     leaves the others in the ordinary way.
--   * The loser of a join race is told "You're already in a group".


-- ---------------------------------------------------------------------------
-- #3 The group follows its members out.
--
-- A second trigger beside `detach_goals_on_leave` (20261116120000), which has
-- already detached the leaver's own habits by the time this runs (triggers on
-- one event fire in name order).
-- ---------------------------------------------------------------------------

create or replace function public.pass_on_group_on_leave()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  heir uuid;
begin
  -- Locked so that two members leaving at the same moment are handled one
  -- after the other: the second sees the first already gone, instead of each
  -- naming the other as heir and neither deleting the emptied group.
  perform 1 from public.groups where id = old.group_id for update;

  select user_id into heir
    from public.group_members
   where group_id = old.group_id
   order by joined_at asc nulls last, id asc
   limit 1;

  if heir is null then
    -- Last one out. Any habit still pointing here belongs to someone who left
    -- before habits were detached on the way out; `goals.group_id` is NO
    -- ACTION, so detach it before dropping the group.
    update public.goals set group_id = null where group_id = old.group_id;
    delete from public.groups where id = old.group_id;
  else
    update public.groups set creator_id = heir
     where id = old.group_id and creator_id = old.user_id;
  end if;

  return old;
end;
$function$;

revoke execute on function public.pass_on_group_on_leave() from public, anon, authenticated;

drop trigger if exists pass_on_group_on_leave on public.group_members;

create trigger pass_on_group_on_leave
  after delete on public.group_members
  for each row execute function public.pass_on_group_on_leave();


-- ---------------------------------------------------------------------------
-- delete_my_account — as 20260909120000, except for what becomes of a group
-- this account created. Its membership going is handled by the trigger above.
-- What is left for the loop is a group the account created and never joined
-- (group creation is two statements): it goes to its longest-standing member
-- rather than to nobody, or is deleted when it has none.
-- ---------------------------------------------------------------------------

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
  heir uuid;
begin
  if my_id is null then
    raise exception 'Not signed in';
  end if;

  -- Gathered before the membership rows go, though only the groups created
  -- and never joined still need anything by the time the loop runs.
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

  -- `pass_on_group_on_leave` hands each group on, or deletes it when this was
  -- its last member.
  delete from public.group_members where user_id = my_id;

  foreach gid in array my_groups loop
    select user_id into heir
      from public.group_members
     where group_id = gid
     order by joined_at asc nulls last, id asc
     limit 1;

    if heir is not null then
      -- `groups.creator_id -> profiles.id` is NO ACTION, so it has to move
      -- before the profile goes; and a group with no creator can never
      -- rotate its code or remove a member.
      update public.groups set creator_id = heir
        where id = gid and creator_id = my_id;
    else
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


-- ---------------------------------------------------------------------------
-- #4 One membership per person.
-- ---------------------------------------------------------------------------

-- Anyone already in two groups keeps the one they joined last. That is where
-- `move_goals_to_new_group` put their habits; any habit added to an older
-- group since is brought along. The older groups are left through the
-- triggers above, like any other departure.
do $$
declare
  r record;
begin
  for r in
    select user_id,
           (array_agg(group_id order by joined_at desc nulls last, id desc))[1] as keep
      from public.group_members
     group by user_id
    having count(*) > 1
  loop
    delete from public.group_members
     where user_id = r.user_id and group_id <> r.keep;
    update public.goals set group_id = r.keep
     where user_id = r.user_id and group_id is distinct from r.keep;
  end loop;
end $$;

alter table public.group_members
  add constraint group_members_one_group_per_user unique (user_id);

-- The constraint's index answers "which group am I in?" from now on.
drop index if exists public.group_members_user_id_idx;

-- As 20261017120000, plus the answer for a join that lost a race. `on
-- conflict do nothing` swallows the new constraint as well as a repeat join
-- of the same group, so what tells them apart is whether the membership
-- asked for exists afterwards.
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
  on conflict do nothing; -- Already inside, or a second join got there first

  if not exists (select 1 from public.group_members
                  where user_id = my_id and group_id = target_group_id) then
    return json_build_object('success', false, 'message', 'You''re already in a group');
  end if;

  return json_build_object('success', true, 'group_id', target_group_id);
end;
$function$;


-- ---------------------------------------------------------------------------
-- #3, existing data: a group with members and no creator among them gets its
-- longest-standing member. After the clean-up above, so nobody is made the
-- creator of a group they have just been taken out of.
-- ---------------------------------------------------------------------------

update public.groups g
   set creator_id = (
     select gm.user_id
       from public.group_members gm
      where gm.group_id = g.id
      order by gm.joined_at asc nulls last, gm.id asc
      limit 1
   )
 where exists (select 1 from public.group_members gm where gm.group_id = g.id)
   and (
     g.creator_id is null
     or not exists (
       select 1 from public.group_members gm
        where gm.group_id = g.id and gm.user_id = g.creator_id
     )
   );
