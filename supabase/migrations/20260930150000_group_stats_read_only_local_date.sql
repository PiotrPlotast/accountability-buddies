-- `get_my_group_stats` reads the streak; it no longer resets it (2026-09-30).
--
-- It used to decide "is this streak stale?" against `now()::date`, the
-- server's UTC date, and *write* `current_streak = 0` when it thought so. West
-- of UTC that date is already tomorrow every evening (5pm in California is
-- midnight UTC), so an open day read as a missed one, the streak was zeroed in
-- the table, and the next check-in counted up from 0 instead of continuing.
--
-- Two changes, each enough on its own to stop the damage:
--
--   1. Read-only. The reset was never needed here: `check_daily_streak`
--      already zeroes a stale streak on the next check-in, and is now the only
--      thing that moves `current_streak`. A wrong "today" can at worst show a
--      wrong number, never destroy one.
--   2. The caller's date. The app passes its local date as `p_today`, the same
--      date `logs.date` is written with. It is optional so installed builds
--      that call without it keep working; they fall back to the server date,
--      as before, minus the write.
--
-- The display rule is unchanged: 0 once `last_streak_date` is older than
-- yesterday. A day still in progress never zeroes it.

-- A new signature would sit beside the old one as an overload, and PostgREST
-- cannot choose between a zero-argument function and one whose only argument
-- has a default.
drop function if exists public.get_my_group_stats();

create function public.get_my_group_stats(p_today date default null)
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
         -- Closed out yesterday or later (a member east of the caller may
         -- already be on tomorrow): the streak stands. Anything older, or a
         -- group that has never closed a day, shows 0.
         case
           when g.last_streak_date >= _today - 1 then g.current_streak
           else 0
         end,
         g.invite_code,
         g.last_streak_date,
         g.icon
    from public.groups g
   where g.id = _group_id;
end;
$function$;

revoke execute on function public.get_my_group_stats(date) from public, anon;
grant  execute on function public.get_my_group_stats(date) to authenticated;
