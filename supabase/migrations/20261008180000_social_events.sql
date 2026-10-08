-- E5 — social events, Phase 6 of todo/push-notifications.md.
--
-- Every 5 minutes the dispatch-notifications Edge Function asks
-- enqueue_social_events() to turn the last few minutes of check-ins and group
-- joins into pending outbox rows for the actor's buddies, beside
-- enqueue_due_reminders(). Tested in `supabase/tests/social_events.sql`.
--
-- Agreed with Piotr (2026-10-08):
--
--   * Ticks are batched: one push per buddy per run for whatever was ticked
--     since the last one. One habit names it ("Ada ticked Read 20 pages 📚"),
--     several give the count and the icons ("Ada ticked 2 habits 📚🏃"), since
--     names would not fit; the body is the day's count ("3 of 5 done today").
--   * The tick that closes the day (`isDayComplete`: something due, all of it
--     ticked) sends "Ada closed out today 🔥" instead, never both, once a day.
--   * A habit is announced once a day; one unticked before the run is not
--     announced at all.
--   * Someone joining tells the members already there.
--   * Buddies only, with Social on, outside their own quiet hours (skipped, not
--     delayed). Nobody hears about their own action.
--   * Only the last 15 minutes are looked at, so a missed run or the first run
--     after deploying never announces something late.


-- A tick push for a buddy is a new type.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('nudge', 'reminder', 'buddy_ticked', 'buddy_done', 'member_joined'));


-- Which habits have been announced on which day, so a re-tick is not news.
-- Server-side only: no policies, no client grants.
create table public.social_announced_ticks (
  goal_id uuid not null references public.goals (id) on delete cascade,
  day     date not null,
  primary key (goal_id, day)
);

alter table public.social_announced_ticks enable row level security;
revoke all on table public.social_announced_ticks from anon, authenticated;


-- ---------------------------------------------------------------------------
-- social_recipients — who hears about something `p_actor` did in `p_group`.
--
-- The other members (joined before `p_joined_before`, so a newcomer is not
-- told about their own arrival) with Social on and not in quiet hours in their
-- own timezone at `p_now`.
-- ---------------------------------------------------------------------------

create or replace function public.social_recipients(
  p_group uuid, p_actor uuid, p_now timestamptz,
  p_joined_before timestamptz default 'infinity')
  returns setof uuid
  language sql
  stable
  set search_path = ''
as $function$
  select gm.user_id
    from public.group_members gm
    join public.notification_prefs p on p.user_id = gm.user_id
   where gm.group_id = p_group
     and gm.user_id <> p_actor
     and gm.joined_at < p_joined_before
     and p.social_enabled
     and not public.is_quiet_time((p_now at time zone p.timezone)::time, p.quiet_start, p.quiet_end)
$function$;

-- First name, as the app's `firstName`, or "Your buddy" without one.
create or replace function public.social_first_name(p_user uuid)
  returns text
  language sql
  stable
  set search_path = ''
as $function$
  select coalesce(
    (select nullif(split_part(btrim(p.full_name), ' ', 1), '')
       from public.profiles p where p.id = p_user),
    'Your buddy')
$function$;

revoke execute on function public.social_recipients(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.social_first_name(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- enqueue_social_events — this run's social pushes, as pending outbox rows.
-- Returns the ids it inserted.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_social_events(p_now timestamptz default now())
  returns setof uuid
  language plpgsql
  set search_path = ''
as $function$
declare
  c       record;
  _since  timestamptz := p_now - interval '15 minutes';
  _name   text;
  _total  int;
  _done   int;
  _new    uuid[];
  _title  text;
  _icons  text;
  _body   text;
begin
  -- Check-ins: every (person, group, day) with one in the window, counted by
  -- the same rule as `isDayComplete`. Habits left in a group their owner has
  -- since left say nothing.
  for c in
    select distinct l.user_id, g.group_id, l.date::date as day
      from public.logs l
      join public.goals g on g.id = l.goal_id and g.user_id = l.user_id
      join public.group_members gm on gm.user_id = l.user_id and gm.group_id = g.group_id
     where l.created_at > _since and l.created_at <= p_now
  loop
    select count(*) filter (where m.due),
           count(*) filter (where m.due and m.ticked_at is not null),
           array_agg(m.id order by m.ticked_at, m.id)
             filter (where m.ticked_at is not null and not m.announced),
           string_agg(nullif(m.icon, ''), '' order by m.ticked_at, m.id)
             filter (where m.ticked_at is not null and not m.announced),
           min(m.title || coalesce(' ' || nullif(m.icon, ''), ''))
             filter (where m.ticked_at is not null and not m.announced)
      into _total, _done, _new, _icons, _title
      from (
        select g.id, g.title, g.icon,
               public.is_goal_due(g.repeat_days, c.day) as due,
               l.created_at as ticked_at,
               exists (select 1 from public.social_announced_ticks a
                        where a.goal_id = g.id and a.day = c.day) as announced
          from public.goals g
          left join public.logs l
            on l.goal_id = g.id and l.user_id = g.user_id and l.date = c.day::text
         where g.user_id = c.user_id and g.group_id = c.group_id
      ) m;

    _name := public.social_first_name(c.user_id);

    if _total > 0 and _done = _total then
      return query
        with ins as (
          insert into public.notifications
            (recipient_id, sender_id, group_id, type, title, body, data, dedupe_key)
          select r, c.user_id, c.group_id, 'buddy_done',
                 _name || ' closed out today 🔥',
                 'Every habit ticked. Your turn?',
                 jsonb_build_object('type', 'buddy_done', 'buddy_id', c.user_id, 'group_id', c.group_id),
                 'buddy_done:' || c.user_id || ':' || c.day || ':' || r
            from public.social_recipients(c.group_id, c.user_id, p_now) as r
          on conflict (dedupe_key) do nothing
          returning id
        )
        select id from ins;
    elsif cardinality(_new) > 0 then
      if cardinality(_new) > 1 then
        _title := cardinality(_new) || ' habits' || coalesce(' ' || _icons, '');
      end if;
      _body := case when _total > 0 then _done || ' of ' || _total || ' done today'
                    else 'Extra credit today.' end;
      return query
        with ins as (
          insert into public.notifications
            (recipient_id, sender_id, group_id, type, title, body, data, dedupe_key)
          select r, c.user_id, c.group_id, 'buddy_ticked',
                 _name || ' ticked ' || _title,
                 _body,
                 jsonb_build_object('type', 'buddy_ticked', 'buddy_id', c.user_id, 'group_id', c.group_id),
                 'buddy_ticked:' || c.user_id || ':' || c.day || ':' || r || ':'
                   || md5(array_to_string(_new, ','))
            from public.social_recipients(c.group_id, c.user_id, p_now) as r
          on conflict (dedupe_key) do nothing
          returning id
        )
        select id from ins;
    end if;

    -- Announced whether or not anyone could hear it: skipped, not delayed.
    insert into public.social_announced_ticks (goal_id, day)
    select unnest(coalesce(_new, '{}')), c.day
    on conflict do nothing;
  end loop;

  -- Joins in the window, told to the members already there.
  for c in
    select gm.user_id, gm.group_id, gm.joined_at, gr.name as group_name
      from public.group_members gm
      join public.groups gr on gr.id = gm.group_id
     where gm.joined_at > _since and gm.joined_at <= p_now
  loop
    _name := public.social_first_name(c.user_id);
    return query
      with ins as (
        insert into public.notifications
          (recipient_id, sender_id, group_id, type, title, body, data, dedupe_key)
        select r, c.user_id, c.group_id, 'member_joined',
               _name || ' joined ' || c.group_name || ' 👋',
               'Say hi with a nudge.',
               jsonb_build_object('type', 'member_joined', 'buddy_id', c.user_id, 'group_id', c.group_id),
               'member_joined:' || c.group_id || ':' || c.user_id || ':' || r
          from public.social_recipients(c.group_id, c.user_id, p_now, c.joined_at) as r
        on conflict (dedupe_key) do nothing
        returning id
      )
      select id from ins;
  end loop;
end;
$function$;

revoke execute on function public.enqueue_social_events(timestamptz) from public, anon, authenticated;
grant  execute on function public.enqueue_social_events(timestamptz) to service_role;
