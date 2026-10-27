-- The group streak counts a day once every member has ticked one habit
-- (2026-10-27).
--
-- Since 20261005160000 a day counted only when every habit due that day, for
-- every member, had a check-in. The rule now, agreed with Piotr:
--
--   * A day counts once every member with something due that day has ticked
--     at least one of their due habits. "Due" is unchanged (`is_goal_due`,
--     `isScheduledOn`), and so is everything else: members with nothing due
--     are skipped, a tick on a habit that isn't due doesn't count, a day on
--     which nobody has anything due neither counts nor breaks the streak, and
--     unticking the check-in that made the day count takes the day back.
--   * "Closed out the day" keeps the old meaning. `lib/isDayComplete.ts` (the
--     celebration haptic and the ring pulse) and `buddy_done` in
--     `enqueue_social_events` still need every due habit ticked; the client's
--     twin of this rule is `countsForStreak` in the same file.
--
-- `is_group_day_complete` is replaced by `group_day_counts`, since the day it
-- answers for no longer has to be complete. `check_daily_streak` and
-- `take_back_daily_streak` change only in the function they call.
-- Verified by supabase/tests/group_streak.sql.

-- `countsForStreak` for a whole group: something was due, and no member with
-- something due is missing a check-in on every one of their due habits.
create or replace function public.group_day_counts(p_group_id uuid, p_day date)
  returns boolean
  language sql
  stable
  set search_path = ''
as $function$
  select public.group_has_due_goals(p_group_id, p_day)
     and not exists (
       select 1
         from public.group_members gm
        where gm.group_id = p_group_id
          and exists (
            select 1
              from public.goals g
             where g.user_id = gm.user_id
               and g.group_id = p_group_id
               and public.is_goal_due(g.repeat_days, p_day)
          )
          and not exists (
            select 1
              from public.goals g
              join public.logs l
                on l.goal_id = g.id
               and l.user_id = g.user_id
               and l.date = p_day::text
             where g.user_id = gm.user_id
               and g.group_id = p_group_id
               and public.is_goal_due(g.repeat_days, p_day)
          )
     )
$function$;

revoke execute on function public.group_day_counts(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A check-in: count the day if it now counts.
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
  select group_id into _group_id from public.goals where id = new.goal_id;
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

  -- A due day was missed since the streak last counted: it is over, whether
  -- or not today counts.
  if _current_streak > 0
     and not public.group_streak_holds(_group_id, _last_streak_date, _day) then
    update public.groups set current_streak = 0 where id = _group_id;
    _current_streak := 0;
  end if;

  if not public.group_day_counts(_group_id, _day) then
    return new;
  end if;

  update public.groups
     set current_streak = _current_streak + 1,
         last_streak_date = _day
   where id = _group_id;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- An untick: take the day back if it no longer counts — when it was a
-- member's only check-in on a due habit.
-- ---------------------------------------------------------------------------

create or replace function public.take_back_daily_streak()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  _group_id uuid;
  _day date := old.date::date;
  _last_streak_date date;
  _current_streak int;
begin
  -- Gone when the log is going because its goal is being deleted (the
  -- cascade): deleting a habit never takes a day back.
  select group_id into _group_id from public.goals where id = old.goal_id;
  if _group_id is null then
    return old;
  end if;

  select last_streak_date, coalesce(current_streak, 0)
    into _last_streak_date, _current_streak
    from public.groups
   where id = _group_id
     for update;

  -- Only the day the streak was last counted on can be taken back; an older
  -- check-in has already been built on.
  if _last_streak_date is distinct from _day or _current_streak = 0 then
    return old;
  end if;

  if public.group_day_counts(_group_id, _day) then
    return old;
  end if;

  -- Back to exactly where the streak stood before this day counted. Every
  -- counted day is a due day and a counted streak has no due day missing, so
  -- that is the previous due day. Re-ticking then counts the day again.
  update public.groups
     set current_streak = _current_streak - 1,
         last_streak_date = public.previous_group_due_day(_group_id, _day)
   where id = _group_id;

  return old;
end;
$function$;

-- Nothing calls it any more.
drop function public.is_group_day_complete(uuid, date);
