-- Security fixes from RLS audit (2026-08-26)
--
-- #1 get_heatmap_logs IDOR: was SECURITY DEFINER with a caller-supplied user_id and no
--    auth check, letting any authenticated user read any user's 84-day log history
--    (enumerating UUIDs via the world-readable profiles table). Switch to
--    SECURITY INVOKER so the "See group logs" RLS policy governs access. Signature is
--    unchanged, so no client change is required. Also revoke anon EXECUTE.
CREATE OR REPLACE FUNCTION public.get_heatmap_logs(p_user_id uuid)
  RETURNS TABLE(log_date text, completed_count integer)
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = ''
AS $function$
  SELECT
    date AS log_date,
    COUNT(*)::integer AS completed_count
  FROM public.logs
  WHERE user_id = p_user_id
    AND date::date >= (CURRENT_DATE - INTERVAL '84 days')::date
  GROUP BY date
  ORDER BY date ASC;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_heatmap_logs(uuid) FROM anon;

-- #3 Pin search_path on the remaining SECURITY DEFINER functions. Where a reference was
--    previously unqualified (group_members), schema-qualify it so '' search_path resolves.
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
begin
  return exists (
    select 1
    from public.group_members
    where group_id = _group_id
    and user_id = auth.uid()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_group_stats()
  RETURNS TABLE(group_id uuid, name text, current_streak integer, invite_code text, last_streak_date date, icon text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
DECLARE
  _group_id uuid;
  _last_date date;
  _current_streak int;
  _yesterday date;
BEGIN
  -- 1. Find the user's group
  select gm.group_id into _group_id
  from public.group_members gm
  where gm.user_id = auth.uid();

  if _group_id is null then
    return;
  end if;

  -- 2. Get the raw stats
  select g.last_streak_date, g.current_streak
  into _last_date, _current_streak
  from public.groups g
  where g.id = _group_id;

  if _last_date is null then _last_date := '1970-01-01'; end if;
  _yesterday := (now()::date - interval '1 day');

  -- 3. THE FIX
  if _last_date < _yesterday and _current_streak > 0 then
    update public.groups
    set current_streak = 0
    where id = _group_id;

    _current_streak := 0;
  end if;

  -- 4. Return fresh data
  return query
  select g.id as group_id, g.name, g.current_streak, g.invite_code, g.last_streak_date, g.icon
  from public.groups g
  where g.id = _group_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_group_via_code(code_input text)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
declare
  target_group_id uuid;
  my_id uuid := auth.uid();
begin
  -- Find group by code
  select id into target_group_id from public.groups where invite_code = code_input;

  if target_group_id is null then
    return json_build_object('success', false, 'message', 'Invalid code');
  end if;

  -- Add user to members
  insert into public.group_members (group_id, user_id)
  values (target_group_id, my_id)
  on conflict do nothing; -- Ignore if already inside

  return json_build_object('success', true, 'group_id', target_group_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_daily_streak()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
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

  -- RESET LOGIC: If streak is old, reset it to 0 immediately
  if _last_streak_date < (new.date::date - interval '1 day') then
     update public.groups set current_streak = 0 where id = _group_id;
     _current_streak := 0;
  end if;

  -- STOP if we already updated the streak for today
  if _last_streak_date = new.date::date and _current_streak > 0 then
     return new;
  end if;

  -- COUNT ACTIVE (People with goals)
  select count(distinct g.user_id) into active_players_count
  from public.goals g
  join public.group_members gm on g.user_id = gm.user_id
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

-- #4 Trigger functions should not be reachable as REST RPCs. Revoking EXECUTE does not
--    affect trigger firing (triggers bypass EXECUTE privilege checks).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_daily_streak() FROM anon, authenticated;
