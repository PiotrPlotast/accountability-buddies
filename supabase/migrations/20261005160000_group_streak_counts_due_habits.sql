-- The group streak counts a day by the same rule as `lib/isDayComplete.ts`
-- (2026-10-05).
--
-- `check_daily_streak` used to count a member as done after one check-in on
-- any of their habits, and waited on every member with a goal whether or not
-- anything was due for them. So the streak went up while people still had
-- habits left to tick, and a member whose habits were all scheduled for other
-- days — who has nothing to tick on the dashboard — broke it for everyone.
--
-- The rule now, agreed with Piotr:
--
--   * A day counts once every habit due that day, for every member of the
--     group, has a check-in. "Due" is `repeat_days` (Mon = 0 … Sun = 6, so
--     `extract(isodow) - 1`; empty means every day), the client's
--     `isScheduledOn`. Members with nothing due, or no goals at all, are
--     skipped.
--   * A day on which nobody has anything due neither counts nor breaks the
--     streak: Friday's streak survives a weekend of weekday-only habits.
--     Only a missed day that had something due breaks it.
--   * Unticking the check-in that closed the day takes the day back, so a
--     tick-and-untick no longer earns one. A habit added after the day closed
--     does not.
--
-- Known approximation: schedules are read as they are now, not as they were on
-- the days being judged. Changing `repeat_days` can therefore change whether a
-- past idle gap breaks the streak.
--
-- Supersedes `check_daily_streak` from 20260930120000 and `get_my_group_stats`
-- from 20260930150000. Verified by supabase/tests/group_streak.sql.

-- ---------------------------------------------------------------------------
-- Helpers. Internal: called only from the trigger functions and
-- `get_my_group_stats`, which are SECURITY DEFINER and run them as the owner.
-- ---------------------------------------------------------------------------

-- `isScheduledOn` in `lib/repeatDays.ts`.
create or replace function public.is_goal_due(p_repeat_days integer[], p_day date)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $function$
  select cardinality(p_repeat_days) = 0
      or (extract(isodow from p_day)::int - 1) = any (p_repeat_days)
$function$;

-- Does any current member have a habit in this group due on `p_day`? Goals
-- left behind by someone who has since left the group don't count.
create or replace function public.group_has_due_goals(p_group_id uuid, p_day date)
  returns boolean
  language sql
  stable
  set search_path = ''
as $function$
  select exists (
    select 1
      from public.goals g
      join public.group_members gm
        on gm.user_id = g.user_id
       and gm.group_id = g.group_id
     where g.group_id = p_group_id
       and public.is_goal_due(g.repeat_days, p_day)
  )
$function$;

-- `isDayComplete` for a whole group: something was due, and every due habit
-- has its owner's check-in for that day.
create or replace function public.is_group_day_complete(p_group_id uuid, p_day date)
  returns boolean
  language sql
  stable
  set search_path = ''
as $function$
  select public.group_has_due_goals(p_group_id, p_day)
     and not exists (
       select 1
         from public.goals g
         join public.group_members gm
           on gm.user_id = g.user_id
          and gm.group_id = g.group_id
        where g.group_id = p_group_id
          and public.is_goal_due(g.repeat_days, p_day)
          and not exists (
            select 1
              from public.logs l
             where l.goal_id = g.id
               and l.user_id = g.user_id
               and l.date = p_day::text
          )
     )
$function$;

-- A streak last counted on `p_last` is still alive on `p_day` if no day in
-- between had anything due. Schedules repeat weekly, so a gap longer than a
-- week is judged by its last seven days alone: if those had nothing due,
-- neither did the rest.
create or replace function public.group_streak_holds(p_group_id uuid, p_last date, p_day date)
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
     )
$function$;

-- The most recent day before `p_day` that had something due — the day a
-- streak counted on `p_day` was counted on before it. A week back is far
-- enough for the same reason as above.
create or replace function public.previous_group_due_day(p_group_id uuid, p_day date)
  returns date
  language sql
  stable
  set search_path = ''
as $function$
  select coalesce(max(d::date), p_day - 1)
    from generate_series(
           (p_day - 7)::timestamp,
           (p_day - 1)::timestamp,
           interval '1 day'
         ) as d
   where public.group_has_due_goals(p_group_id, d::date)
$function$;

revoke execute on function public.is_goal_due(integer[], date)                 from public, anon, authenticated;
revoke execute on function public.group_has_due_goals(uuid, date)              from public, anon, authenticated;
revoke execute on function public.is_group_day_complete(uuid, date)            from public, anon, authenticated;
revoke execute on function public.group_streak_holds(uuid, date, date)         from public, anon, authenticated;
revoke execute on function public.previous_group_due_day(uuid, date)           from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A check-in: count the day if it is now complete.
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

  -- Locked so that two members closing the day at the same moment are judged
  -- one after the other: the second sees the first's check-in, instead of
  -- each seeing the other's as missing and neither counting the day.
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

  -- Already counted today. Also covers a habit added after the day closed:
  -- ticking it doesn't count the day twice.
  if _last_streak_date = _day and _current_streak > 0 then
    return new;
  end if;

  -- A due day was missed since the streak last counted: it is over, whether
  -- or not today completes.
  if _current_streak > 0
     and not public.group_streak_holds(_group_id, _last_streak_date, _day) then
    update public.groups set current_streak = 0 where id = _group_id;
    _current_streak := 0;
  end if;

  if not public.is_group_day_complete(_group_id, _day) then
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
-- An untick: take the day back if it no longer stands.
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

  if public.is_group_day_complete(_group_id, _day) then
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

revoke execute on function public.take_back_daily_streak() from public, anon, authenticated;

drop trigger if exists on_log_deleted on public.logs;

create trigger on_log_deleted
  after delete on public.logs
  for each row execute function public.take_back_daily_streak();

-- ---------------------------------------------------------------------------
-- The read: a streak stands while no due day has been missed since it last
-- counted. Today is still open, so it never breaks the streak. Signature,
-- grants and `security definer` are preserved by `create or replace`.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_group_stats(p_today date default null)
  returns table (
    group_id uuid,
    name text,
    current_streak integer,
    invite_code text,
    last_streak_date date,
    icon text
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $function$
declare
  _group_id uuid;
  _today date := coalesce(p_today, current_date);
begin
  select gm.group_id into _group_id
    from public.group_members gm
   where gm.user_id = auth.uid();

  if _group_id is null then
    return;
  end if;

  return query
  select g.id,
         g.name,
         -- `group_streak_holds` is also true when `last_streak_date` is today
         -- or later (a member east of the caller may already be on
         -- tomorrow). A group that has never closed a day shows 0.
         case
           when public.group_streak_holds(g.id, g.last_streak_date, _today)
             then g.current_streak
           else 0
         end,
         g.invite_code,
         g.last_streak_date,
         g.icon
    from public.groups g
   where g.id = _group_id;
end;
$function$;
