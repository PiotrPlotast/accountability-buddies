-- Security review fixes (2026-09-18).
--
-- Three server-side findings, all in the original schema rather than in any
-- recent change:
--
--   #1 `logs` INSERT checked who a check-in claimed to be from but never which
--      goal it pointed at, so any group member could tick off a buddy's habit —
--      and the buddy could not delete it again, because the DELETE policy is
--      keyed on `user_id`.
--   #2 `logs.date` was free text with no format and no bound, so a member could
--      write a far-future date straight into `groups.last_streak_date` through
--      the `check_daily_streak` trigger and freeze the whole group's streak, or
--      a backdated one and reset it to 1.
--   #3 `invite_code` was six hex characters (~24 bits) from `random()`, a
--      non-cryptographic PRNG, and a correct guess is full read access to a
--      group's members, habits and logs. There was also no way back out: no
--      DELETE policy on `group_members` to remove an intruder, and the groups
--      UPDATE policy pinned `invite_code` so it could not be rotated.

-- ---------------------------------------------------------------------------
-- #1 A check-in may only be written against your own goal.
-- ---------------------------------------------------------------------------

-- Same goal, same user, same day was insertable twice, which double-counts in
-- `get_heatmap_logs`. The duplicates have to go before the constraint can
-- exist; the earliest row of each set survives, since that is the one the
-- streak trigger already counted.
delete from public.logs
 where id in (
   select id
     from (
       select id,
              row_number() over (
                partition by goal_id, user_id, date
                order by coalesce(created_at, '-infinity'::timestamptz), id
              ) as rn
         from public.logs
     ) ranked
    where ranked.rn > 1
 );

-- Rows the hole actually let through: a check-in whose author is not the owner
-- of the goal it points at. Nothing in the app has ever written one — the
-- client always sends its own `auth.uid()` against a goal it owns — so any that
-- exist are forged, and the member they were written against cannot delete them
-- (the DELETE policy is keyed on `user_id`, which is the attacker's).
delete from public.logs l
 using public.goals g
 where g.id = l.goal_id
   and g.user_id <> l.user_id;

alter table public.logs
  add constraint logs_one_per_goal_per_day unique (goal_id, user_id, date);

-- #2, first half: the column is text (PostgREST and the client both speak
-- `YYYY-MM-DD` through `getTodayLocalDate`), so the shape is a constraint
-- rather than a type. Written out day by day instead of `date::date` so an
-- impossible date fails the check rather than raising a cast error.
alter table public.logs
  add constraint logs_date_is_iso_date
  check (date ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$');

drop policy if exists "Create logs" on public.logs;

create policy "Create logs" on public.logs
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    -- The part that was missing: the goal has to be yours.
    and exists (
      select 1
        from public.goals g
       where g.id = logs.goal_id
         and g.user_id = (select auth.uid())
    )
    -- #2, second half: a check-in is for now. The client sends its own local
    -- date, which sits a day either side of the server's UTC date depending on
    -- the timezone, so the window is one day wide in both directions rather
    -- than an equality test.
    and date::date between current_date - 1 and current_date + 1
  );

-- #2, third half. The window above still admits yesterday, and the trigger
-- treats any date it has not seen as the new streak date — so a backdated
-- check-in would take a group on a 40-day streak back to 1. A streak date only
-- ever moves forward now; everything else in the function is unchanged.
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

-- ---------------------------------------------------------------------------
-- #3 Invite codes: enough entropy, from a CSPRNG, and revocable.
-- ---------------------------------------------------------------------------

-- 5 bytes = 40 bits, ten characters. Uppercase hex because the code is read off
-- one screen and typed into another, where the input is `autoCapitalize`d —
-- the lookup below is case-insensitive for the same reason.
create or replace function public.generate_invite_code()
  returns text
  language sql
  volatile
  set search_path = ''
as $function$
  select upper(encode(extensions.gen_random_bytes(5), 'hex'));
$function$;

-- The creator rotates a code with `update groups set invite_code =
-- generate_invite_code()`, so `authenticated` has to be able to call this. It
-- reads nothing and returns random bytes; the groups UPDATE policy below is
-- what decides whose code may actually change.
revoke execute on function public.generate_invite_code() from public, anon;
grant  execute on function public.generate_invite_code() to authenticated;

alter table public.groups
  alter column invite_code set default public.generate_invite_code();

-- The old codes stay guessable for as long as they are live, so they are
-- retired here rather than left to age out. Invites already shared stop
-- working; the new code is in Group settings.
update public.groups set invite_code = public.generate_invite_code();

-- `groups_invite_code_key` is still the uniqueness of record; this one makes it
-- hold case-insensitively too, and is the index the lookup below can use.
create unique index if not exists groups_invite_code_upper_idx
  on public.groups (upper(invite_code));

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
  -- EXECUTE is granted to `authenticated` only, so this is belt and braces —
  -- but a null id would otherwise insert a row that violates nothing until the
  -- foreign key fires.
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

  -- Add user to members
  insert into public.group_members (group_id, user_id)
  values (target_group_id, my_id)
  on conflict do nothing; -- Ignore if already inside

  return json_build_object('success', true, 'group_id', target_group_id);
end;
$function$;

-- Rotation. The creator may change `invite_code`; every member may still rename
-- the group and change its icon; `creator_id` stays pinned for everyone, as
-- before.
drop policy if exists "members can update group" on public.groups;

create policy "members can update group" on public.groups
  for update
  to authenticated
  using (public.is_group_member(id))
  with check (
    public.is_group_member(id)
    and creator_id = (select g.creator_id from public.groups g where g.id = groups.id)
    and (
      invite_code = (select g.invite_code from public.groups g where g.id = groups.id)
      or (select g.creator_id from public.groups g where g.id = groups.id) = (select auth.uid())
    )
  );

-- Revocation. `group_members` carried no DELETE policy at all, so nobody could
-- leave a group and nobody could remove someone who had guessed their way in.
create policy "Leave or remove from group" on public.group_members
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
        from public.groups g
       where g.id = group_members.group_id
         and g.creator_id = (select auth.uid())
    )
  );
