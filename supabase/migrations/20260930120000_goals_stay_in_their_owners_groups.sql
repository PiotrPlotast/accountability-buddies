-- Goals stay in groups their owners belong to (2026-09-30).
--
-- Two halves of one hole:
--
--   #1 "Create goals" checked only `user_id = auth.uid()` and "Edit habits"
--      had no WITH CHECK beyond the owner, so anyone could write a goal into
--      any group whose id they knew, or move one of their own goals there. A
--      removed member keeps the id, which is exactly the person the E5
--      revocation work was meant to keep out.
--   #2 `check_daily_streak` counted "active players" by joining
--      `group_members` on `user_id` alone, so an outsider's planted goal
--      counted as a player in that group who never checks in. The group could
--      never close out a day again.
--
-- Checked against live before writing this: no existing goal sits outside its
-- owner's groups, so nothing needs cleaning up for the new checks to hold.

-- ---------------------------------------------------------------------------
-- #1 A goal may only be created in, or moved to, a group you are a member of.
-- ---------------------------------------------------------------------------

drop policy if exists "Create goals" on public.goals;

create policy "Create goals" on public.goals
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_group_member(group_id)
  );

-- USING is unchanged: you may still edit any goal you own. The new WITH CHECK
-- is what stops an edit from carrying it into somebody else's group.
drop policy if exists "Edit habits" on public.goals;

create policy "Edit habits" on public.goals
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.is_group_member(group_id)
  );

-- ---------------------------------------------------------------------------
-- #2 Only this group's members count as its players.
-- ---------------------------------------------------------------------------

-- Unchanged from 20260918120000 apart from the join in COUNT ACTIVE.
create or replace function public.check_daily_streak()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  _group_id uuid;
  active_players_count int;
  finished_players_count int;
  _last_streak_date date;
  _current_streak int;
begin
  -- Find the group
  select group_id into _group_id from public.goals where id = new.goal_id;

  -- Get current group stats
  select last_streak_date, current_streak
  into _last_streak_date, _current_streak
  from public.groups where id = _group_id;

  -- Handle fresh groups
  if _last_streak_date is null then _last_streak_date := '1970-01-01'; end if;

  -- A check-in dated before the streak we already hold changes nothing about
  -- that streak. Without this, logging yesterday rewrites `last_streak_date`
  -- backwards and restarts the count at 1 for every member of the group.
  if _last_streak_date > new.date::date then
     return new;
  end if;

  -- RESET LOGIC: If streak is old, reset it to 0 immediately
  if _last_streak_date < (new.date::date - interval '1 day') then
     update public.groups set current_streak = 0 where id = _group_id;
     _current_streak := 0;
  end if;

  -- STOP if we already updated the streak for today
  if _last_streak_date = new.date::date and _current_streak > 0 then
     return new;
  end if;

  -- COUNT ACTIVE (members of *this* group with goals in it). Joining on
  -- `user_id` alone counted anyone who belonged to any group at all.
  select count(distinct g.user_id) into active_players_count
  from public.goals g
  join public.group_members gm
    on gm.user_id = g.user_id
   and gm.group_id = g.group_id
  where g.group_id = _group_id;

  -- COUNT FINISHED (People with logs TODAY)
  select count(distinct l.user_id) into finished_players_count
  from public.logs l
  join public.goals g on l.goal_id = g.id
  where g.group_id = _group_id
  and l.date = new.date;

  -- UPDATE LOGIC
  if finished_players_count >= active_players_count then
     if _last_streak_date = (new.date::date - interval '1 day') then
        update public.groups
        set current_streak = current_streak + 1, last_streak_date = new.date::date
        where id = _group_id;
     else
        update public.groups
        set current_streak = 1, last_streak_date = new.date::date
        where id = _group_id;
     end if;
  end if;

  return new;
end;
$function$;
