-- Group streak rule (2026-10-27): the streak counts a day once every member
-- with something due that day has ticked at least one of their due habits.
-- Members with nothing due are skipped, a tick on a habit that isn't due that
-- day doesn't count, a day on which nobody has anything due neither counts nor
-- breaks the streak, and unticking the check-in that made the day count takes
-- the day back. (Before 2026-10-27 every due habit had to be ticked — the rule
-- `lib/isDayComplete.ts` still uses for the celebration and `buddy_done`.)
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/group_streak.sql
-- Each case raises on failure; everything runs in one transaction that is
-- rolled back, so nothing is left behind.
--
-- Dates: 2026-10-05 is a Monday. `repeat_days` is Mon = 0 … Sun = 6.

begin;

create function pg_temp.mk_group(p_streak int default 0, p_last date default null)
  returns uuid language sql as $$
  insert into public.groups (name, current_streak, last_streak_date)
  values ('test', p_streak, p_last) returning id
$$;

create function pg_temp.mk_member(p_group uuid)
  returns uuid language plpgsql as $$
declare _id uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (_id);
  insert into public.profiles (id, full_name) values (_id, 'test')
    on conflict (id) do nothing;
  insert into public.group_members (group_id, user_id) values (p_group, _id);
  return _id;
end $$;

create function pg_temp.mk_goal(p_user uuid, p_group uuid, p_days int[] default array[0,1,2,3,4,5,6])
  returns uuid language sql as $$
  insert into public.goals (user_id, group_id, title, repeat_days)
  values (p_user, p_group, 'habit', p_days) returning id
$$;

create function pg_temp.tick(p_goal uuid, p_date date)
  returns void language sql as $$
  insert into public.logs (goal_id, user_id, date)
  select id, user_id, p_date::text from public.goals where id = p_goal
$$;

create function pg_temp.untick(p_goal uuid, p_date date)
  returns void language sql as $$
  delete from public.logs where goal_id = p_goal and date = p_date::text
$$;

create function pg_temp.expect(p_group uuid, p_streak int, p_last date, p_case text)
  returns void language plpgsql as $$
declare _s int; _d date;
begin
  select current_streak, last_streak_date into _s, _d from public.groups where id = p_group;
  if _s is distinct from p_streak or _d is distinct from p_last then
    raise exception '%: expected streak % on %, got % on %', p_case, p_streak, p_last, _s, _d;
  end if;
end $$;

-- 1. One due habit ticked per member counts the day; the rest can stay
--    unticked. Every member with something due has to tick one.
do $$
declare g uuid := pg_temp.mk_group(); a uuid := pg_temp.mk_member(g); b uuid := pg_temp.mk_member(g);
        a_run uuid := pg_temp.mk_goal(a, g); a_read uuid := pg_temp.mk_goal(a, g); b_run uuid := pg_temp.mk_goal(b, g);
begin
  perform pg_temp.tick(a_run, '2026-10-05');
  perform pg_temp.expect(g, 0, null, 'a member with nothing ticked holds the day open');
  perform pg_temp.tick(b_run, '2026-10-05');
  perform pg_temp.expect(g, 1, '2026-10-05', 'one habit each counts the day');
  perform pg_temp.tick(a_read, '2026-10-05');
  perform pg_temp.expect(g, 1, '2026-10-05', 'a second habit does not count the day twice');
end $$;

-- 1b. A tick on a habit that isn't due doesn't stand in for a due one.
do $$
declare g uuid := pg_temp.mk_group(); a uuid := pg_temp.mk_member(g); b uuid := pg_temp.mk_member(g);
        a_run uuid := pg_temp.mk_goal(a, g); b_run uuid := pg_temp.mk_goal(b, g);
        b_gym uuid := pg_temp.mk_goal(b, g, array[2]); -- Wednesday only
begin
  perform pg_temp.tick(a_run, '2026-10-05');
  perform pg_temp.tick(b_gym, '2026-10-05');
  perform pg_temp.expect(g, 0, null, 'not-due tick does not count');
  perform pg_temp.tick(b_run, '2026-10-05');
  perform pg_temp.expect(g, 1, '2026-10-05', 'due tick counts');
end $$;

-- 2. A member with nothing due today is skipped, not waited for.
do $$
declare g uuid := pg_temp.mk_group(); a uuid := pg_temp.mk_member(g); b uuid := pg_temp.mk_member(g);
        a_run uuid := pg_temp.mk_goal(a, g); b_gym uuid := pg_temp.mk_goal(b, g, array[0,2,4]);
begin
  perform pg_temp.tick(a_run, '2026-10-06'); -- Tuesday: Gym is Mon/Wed/Fri
  perform pg_temp.expect(g, 1, '2026-10-06', 'idle member skipped');
end $$;

-- 3. An empty `repeat_days` means every day.
do $$
declare g uuid := pg_temp.mk_group(); a uuid := pg_temp.mk_member(g); b uuid := pg_temp.mk_member(g);
        a_run uuid := pg_temp.mk_goal(a, g); b_any uuid := pg_temp.mk_goal(b, g, '{}');
begin
  perform pg_temp.tick(a_run, '2026-10-06');
  perform pg_temp.expect(g, 0, null, 'empty repeat_days is due');
  perform pg_temp.tick(b_any, '2026-10-06');
  perform pg_temp.expect(g, 1, '2026-10-06', 'empty repeat_days ticked');
end $$;

-- 4. A tick on a habit that is not due today does not close anyone's day.
do $$
declare g uuid := pg_temp.mk_group(); a uuid := pg_temp.mk_member(g);
        a_gym uuid := pg_temp.mk_goal(a, g, array[0,2,4]);
begin
  perform pg_temp.tick(a_gym, '2026-10-06');
  perform pg_temp.expect(g, 0, null, 'nothing due: no count');
end $$;

-- 5. A weekend on which nobody has anything due holds the streak: Friday's
--    streak carries to Monday. Sunday is index 6, not 0.
do $$
declare g uuid := pg_temp.mk_group(5, '2026-10-02'); a uuid := pg_temp.mk_member(g);
        a_work uuid := pg_temp.mk_goal(a, g, array[0,1,2,3,4]);
begin
  perform pg_temp.tick(a_work, '2026-10-05');
  perform pg_temp.expect(g, 6, '2026-10-05', 'idle weekend holds');
end $$;

-- 6. …but a missed day that had something due still breaks it.
do $$
declare g uuid := pg_temp.mk_group(5, '2026-10-01'); a uuid := pg_temp.mk_member(g);
        a_work uuid := pg_temp.mk_goal(a, g, array[0,1,2,3,4]);
begin
  perform pg_temp.tick(a_work, '2026-10-05'); -- Friday 10-02 was due and missed
  perform pg_temp.expect(g, 1, '2026-10-05', 'missed due day breaks');
end $$;

-- 7. Members with no goals at all are skipped.
do $$
declare g uuid := pg_temp.mk_group(); a uuid := pg_temp.mk_member(g); c uuid := pg_temp.mk_member(g);
        a_run uuid := pg_temp.mk_goal(a, g);
begin
  perform pg_temp.tick(a_run, '2026-10-05');
  perform pg_temp.expect(g, 1, '2026-10-05', 'goal-less member skipped');
end $$;

-- 8. Unticking the check-in that counted the day takes the day back, to the
--    exact state before it; ticking again counts it once more.
do $$
declare g uuid := pg_temp.mk_group(3, '2026-10-04'); a uuid := pg_temp.mk_member(g);
        a_run uuid := pg_temp.mk_goal(a, g);
begin
  perform pg_temp.tick(a_run, '2026-10-05');
  perform pg_temp.expect(g, 4, '2026-10-05', 'untick: closed');
  perform pg_temp.untick(a_run, '2026-10-05');
  perform pg_temp.expect(g, 3, '2026-10-04', 'untick: taken back');
  perform pg_temp.tick(a_run, '2026-10-05');
  perform pg_temp.expect(g, 4, '2026-10-05', 'untick: re-ticked');
end $$;

-- 8b. With two habits ticked, unticking one leaves the day counted; unticking
--     the last one takes it back.
do $$
declare g uuid := pg_temp.mk_group(3, '2026-10-04'); a uuid := pg_temp.mk_member(g);
        a_run uuid := pg_temp.mk_goal(a, g); a_read uuid := pg_temp.mk_goal(a, g);
begin
  perform pg_temp.tick(a_run, '2026-10-05');
  perform pg_temp.tick(a_read, '2026-10-05');
  perform pg_temp.expect(g, 4, '2026-10-05', 'two ticks: counted once');
  perform pg_temp.untick(a_run, '2026-10-05');
  perform pg_temp.expect(g, 4, '2026-10-05', 'one tick left: still counted');
  perform pg_temp.untick(a_read, '2026-10-05');
  perform pg_temp.expect(g, 3, '2026-10-04', 'last tick gone: taken back');
end $$;

-- 9. Taking back a streak's first day leaves it at 0 and re-ticking starts it
--    at 1 again, even after an idle gap.
do $$
declare g uuid := pg_temp.mk_group(); a uuid := pg_temp.mk_member(g);
        a_work uuid := pg_temp.mk_goal(a, g, array[0,1,2,3,4]);
begin
  perform pg_temp.tick(a_work, '2026-10-05');
  perform pg_temp.untick(a_work, '2026-10-05');
  perform pg_temp.expect(g, 0, '2026-10-02', 'first day taken back'); -- previous due day
  perform pg_temp.tick(a_work, '2026-10-05');
  perform pg_temp.expect(g, 1, '2026-10-05', 'first day re-ticked');
end $$;

-- 10. Unticking something that never closed the day changes nothing, and
--     neither does unticking a habit that isn't due today.
do $$
declare g uuid := pg_temp.mk_group(); a uuid := pg_temp.mk_member(g); b uuid := pg_temp.mk_member(g);
        a_run uuid := pg_temp.mk_goal(a, g); b_run uuid := pg_temp.mk_goal(b, g);
        a_gym uuid := pg_temp.mk_goal(a, g, array[2]);
begin
  perform pg_temp.tick(a_run, '2026-10-05');
  perform pg_temp.untick(a_run, '2026-10-05');
  perform pg_temp.expect(g, 0, null, 'untick before close');
  perform pg_temp.tick(a_run, '2026-10-05');
  perform pg_temp.tick(b_run, '2026-10-05');
  perform pg_temp.tick(a_gym, '2026-10-05');
  perform pg_temp.untick(a_gym, '2026-10-05');
  perform pg_temp.expect(g, 1, '2026-10-05', 'untick of a habit not due');
end $$;

-- 11. A habit added after the day counted does not take the day back, and
--     ticking it does not count the day twice.
do $$
declare g uuid := pg_temp.mk_group(); a uuid := pg_temp.mk_member(g);
        a_run uuid := pg_temp.mk_goal(a, g); a_new uuid;
begin
  perform pg_temp.tick(a_run, '2026-10-05');
  a_new := pg_temp.mk_goal(a, g);
  perform pg_temp.expect(g, 1, '2026-10-05', 'late habit: stays');
  perform pg_temp.tick(a_new, '2026-10-05');
  perform pg_temp.expect(g, 1, '2026-10-05', 'late habit: no double count');
end $$;

-- 12. Yesterday's check-in never moves the streak backwards (unchanged rule).
do $$
declare g uuid := pg_temp.mk_group(); a uuid := pg_temp.mk_member(g);
        a_run uuid := pg_temp.mk_goal(a, g);
begin
  perform pg_temp.tick(a_run, '2026-10-05');
  perform pg_temp.tick(a_run, '2026-10-04');
  perform pg_temp.expect(g, 1, '2026-10-05', 'backdated tick ignored');
  perform pg_temp.untick(a_run, '2026-10-04');
  perform pg_temp.expect(g, 1, '2026-10-05', 'backdated untick ignored');
end $$;

-- 13. `get_my_group_stats` agrees: an idle weekend keeps Friday's streak on
--     Saturday and Monday (today still open), and a missed due Monday shows 0
--     from Tuesday.
do $$
declare g uuid := pg_temp.mk_group(5, '2026-10-02'); a uuid := pg_temp.mk_member(g);
        a_work uuid := pg_temp.mk_goal(a, g, array[0,1,2,3,4]);
        _s int;
begin
  perform set_config('request.jwt.claim.sub', a::text, true);
  select current_streak into _s from public.get_my_group_stats('2026-10-03');
  if _s <> 5 then raise exception 'stats: Saturday shows %, expected 5', _s; end if;
  select current_streak into _s from public.get_my_group_stats('2026-10-05');
  if _s <> 5 then raise exception 'stats: Monday shows %, expected 5', _s; end if;
  select current_streak into _s from public.get_my_group_stats('2026-10-06');
  if _s <> 0 then raise exception 'stats: missed Monday shows %, expected 0', _s; end if;
end $$;

\echo 'group_streak: all cases passed'

rollback;
