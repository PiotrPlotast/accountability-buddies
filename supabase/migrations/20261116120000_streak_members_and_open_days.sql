-- Security review fixes (2026-11-16). Tested in supabase/tests/group_streak.sql
-- (cases 14 to 19) and supabase/tests/leave_group.sql (cases 13 to 16).
--
--   #1 Anyone who had ever been in a group could reset its streak, every day.
--      A `group_members` row deleted directly (by the member, or by the
--      creator removing them) left that person's habits pointing at the group,
--      unlike `leave_group()`, which detaches them. `check_daily_streak` never
--      asked whether a check-in's author was still a member, and `logs` takes
--      a check-in dated tomorrow, so one tick from outside the group made
--      today look like a missed day and zeroed the streak.
--   #2 The same judgement broke streaks with nobody misbehaving. A member
--      whose date is already tomorrow (Auckland, in a group with Los Angeles)
--      ticks before the others have finished today, and the trigger read
--      today as missed.
--
-- Agreed with Piotr:
--
--   * A day is missed only once it has ended for every member of the group,
--     in the timezone each one's `notification_prefs` holds (UTC until the
--     app has written one). This is the rule for the trigger and for the
--     number `get_my_group_stats` shows.
--   * However a membership row goes, its owner's habits are detached, as
--     `leave_group()` always did. A check-in only moves the streak of a group
--     its author is a member of.
--   * Habits already pointing at a group their owner is not in are detached
--     here. A streak that was reset this way cannot be put back.
--
-- Unchanged: what makes a day count (`group_day_counts`), taking a day back
-- on an untick, and everything `leave_group()` does.


-- ---------------------------------------------------------------------------
-- Has `p_day` ended for everyone in the group?
--
-- `notification_prefs.timezone` is written by its owner, so it is bounded: no
-- stored value holds a day open past its end in the last timezone on Earth
-- (UTC-12). Nor can one member end a day early for the others, since it has
-- to be over for all of them.
-- ---------------------------------------------------------------------------

create or replace function public.group_day_is_over(
  p_group_id uuid, p_day date, p_now timestamptz default now())
  returns boolean
  language sql
  stable
  set search_path = ''
as $function$
  select ((p_now at time zone 'UTC') - interval '12 hours')::date > p_day
      or not exists (
        select 1
          from public.group_members gm
          left join public.notification_prefs np on np.user_id = gm.user_id
         where gm.group_id = p_group_id
           and (p_now at time zone coalesce(np.timezone, 'UTC'))::date <= p_day
      )
$function$;

revoke execute on function public.group_day_is_over(uuid, date, timestamptz) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- A streak last counted on `p_last` is still alive on `p_day` while no due
-- day in between has been missed, and a day is not missed until it is over.
-- Otherwise as 20261005160000: a week back is far enough, since schedules
-- repeat weekly.
--
-- `p_now` is the clock the days are judged by. At 'infinity' every day is
-- over, which is the old meaning: no day in between had anything due.
--
-- Dropped first: with a defaulted fourth argument beside the old signature, a
-- three-argument call would be ambiguous. `get_my_group_stats` calls it with
-- three and picks this one up as it is.
-- ---------------------------------------------------------------------------

drop function public.group_streak_holds(uuid, date, date);

create function public.group_streak_holds(
  p_group_id uuid, p_last date, p_day date, p_now timestamptz default now())
  returns boolean
  language sql
  stable
  set search_path = ''
as $function$
  select p_last is not null
     and not exists (
       select 1
         from generate_series(
                greatest(p_last + 1, p_day - 7)::timestamp,
                (p_day - 1)::timestamp,
                interval '1 day'
              ) as d
        where public.group_has_due_goals(p_group_id, d::date)
          and public.group_day_is_over(p_group_id, d::date, p_now)
     )
$function$;

revoke execute on function public.group_streak_holds(uuid, date, date, timestamptz) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- A check-in: count the day if it now counts. As 20261027120000, except that
--   * only a member's check-in is looked at;
--   * a due day in between breaks the streak only once it is over;
--   * counting a day over a due day that never counted starts the streak
--     again, so an open day cannot be skipped by ticking the one after it.
-- ---------------------------------------------------------------------------

create or replace function public.check_daily_streak()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  _group_id uuid;
  _day date := new.date::date;
  _last_streak_date date;
  _current_streak int;
begin
  -- The habit's group, when its owner is in it. A habit left pointing at a
  -- group its owner is no longer in says nothing about that group.
  select g.group_id into _group_id
    from public.goals g
    join public.group_members gm
      on gm.group_id = g.group_id
     and gm.user_id = g.user_id
   where g.id = new.goal_id
     and g.user_id = new.user_id;
  if _group_id is null then
    return new;
  end if;

  -- Locked so that two members ticking their first habit at the same moment
  -- are judged one after the other: the second sees the first's check-in,
  -- instead of each seeing the other's as missing and neither counting the
  -- day.
  select last_streak_date, coalesce(current_streak, 0)
    into _last_streak_date, _current_streak
    from public.groups
   where id = _group_id
     for update;

  -- A check-in dated before the streak we already hold changes nothing about
  -- that streak. Without this, logging yesterday rewrites `last_streak_date`
  -- backwards and restarts the count.
  if _last_streak_date > _day then
    return new;
  end if;

  -- Already counted today. Also covers a second habit, or one added after the
  -- day counted: ticking it doesn't count the day twice.
  if _last_streak_date = _day and _current_streak > 0 then
    return new;
  end if;

  -- A due day was missed since the streak last counted, and it is over for
  -- everyone: the streak is over, whether or not today counts.
  if _current_streak > 0
     and not public.group_streak_holds(_group_id, _last_streak_date, _day) then
    update public.groups set current_streak = 0 where id = _group_id;
    _current_streak := 0;
  end if;

  if not public.group_day_counts(_group_id, _day) then
    return new;
  end if;

  -- This day counts, and `last_streak_date` moves to it, so a due day before
  -- it that never counted can no longer count: open or not, it was skipped.
  if _current_streak > 0
     and not public.group_streak_holds(_group_id, _last_streak_date, _day, 'infinity') then
    _current_streak := 0;
  end if;

  update public.groups
     set current_streak = _current_streak + 1,
         last_streak_date = _day
   where id = _group_id;

  return new;
end;
$function$;


-- ---------------------------------------------------------------------------
-- Habits follow their owner out of a group, whichever way the membership
-- goes: `leave_group()`, the member deleting their own row, or the creator
-- removing them (the "Leave or remove from group" policy, 20260918120000).
-- Detached, as in `leave_group()`: `move_goals_to_new_group` brings them into
-- the next group their owner joins.
-- ---------------------------------------------------------------------------

create or replace function public.detach_goals_on_leave()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
begin
  update public.goals
     set group_id = null
   where group_id = old.group_id
     and user_id = old.user_id;
  return old;
end;
$function$;

revoke execute on function public.detach_goals_on_leave() from public, anon, authenticated;

drop trigger if exists detach_goals_on_leave on public.group_members;

create trigger detach_goals_on_leave
  after delete on public.group_members
  for each row execute function public.detach_goals_on_leave();


-- Habits a membership deleted before this trigger existed left behind.
update public.goals g
   set group_id = null
 where g.group_id is not null
   and not exists (
     select 1
       from public.group_members gm
      where gm.group_id = g.group_id
        and gm.user_id = g.user_id
   );
