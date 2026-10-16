-- E7 — cheer a friend, the server half. Tested in `supabase/tests/send_cheer.sql`
-- and case 18 of `supabase/tests/social_events.sql`.
--
-- Agreed with Piotr (2026-10-16):
--
--   * Two kinds of cheer, worded differently. A habit cheer is about one
--     habit ("Piotr cheered your Run 🏃"), sent from a single-habit
--     `buddy_ticked` push or by swiping a ticked habit on a buddy's tab. A day
--     cheer is about the whole day ("Piotr cheered your day 🎉"), sent from a
--     several-habit or `buddy_done` push, or the Cheer button on a buddy's tab.
--   * One cheer per habit per day, and one day cheer per buddy per day, from
--     each sender. That is the whole limit.
--   * Receiving cheers follows the Social switch.
--   * A habit unticked in the meantime is cheered anyway.
--
-- The send path is the nudge's: the send-cheer Edge Function calls
-- enqueue_cheer() with the caller's JWT and pushes what it lets through.


alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('nudge', 'reminder', 'buddy_ticked', 'buddy_done', 'member_joined', 'cheer'));


-- ---------------------------------------------------------------------------
-- enqueue_cheer — the cheer rules, called with the sender's JWT.
--
-- `p_goal` set is a habit cheer, null a day cheer. `p_day` is the day the
-- cheer is about: the push's `day`, or the phone's today from a buddy's tab.
-- It may be a day either side of the server's date, the window `logs` allows,
-- and defaults to the server's today.
--
-- Returns `{ success, message, notification_id }` like enqueue_nudge, and
-- like it, recipient-side refusals all read "Couldn't deliver that cheer" so
-- nobody can probe who switched Social off.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_cheer(
  p_recipient uuid, p_message text default null,
  p_goal uuid default null, p_day date default null)
  returns json
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  my_id          uuid := auth.uid();
  cheer_day      date := coalesce(p_day, current_date);
  shared_group   uuid;
  goal_title     text;
  goal_icon      text;
  sender_name    text;
  recipient_name text;
  clean          text;
  key            text;
  first_sent     timestamptz;
  new_id         uuid;
begin
  if my_id is null then
    return json_build_object('success', false, 'message', 'Not signed in');
  end if;

  if p_recipient = my_id then
    return json_build_object('success', false, 'message', 'You can''t cheer yourself');
  end if;

  if p_goal is null then
    select a.group_id into shared_group
      from public.group_members a
      join public.group_members b on b.group_id = a.group_id
     where a.user_id = my_id and b.user_id = p_recipient
     order by a.group_id
     limit 1;
  else
    -- The recipient's habit, in a group they both belong to.
    select g.group_id, g.title, nullif(g.icon, '')
      into shared_group, goal_title, goal_icon
      from public.goals g
      join public.group_members a on a.group_id = g.group_id and a.user_id = my_id
      join public.group_members b on b.group_id = g.group_id and b.user_id = g.user_id
     where g.id = p_goal and g.user_id = p_recipient;
  end if;

  if shared_group is null
     or not exists (select 1 from public.notification_prefs
                     where user_id = p_recipient and social_enabled) then
    return json_build_object('success', false, 'message', 'Couldn''t deliver that cheer');
  end if;

  if cheer_day not between current_date - 1 and current_date + 1 then
    return json_build_object('success', false, 'message', 'It''s too late to cheer that day');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cheer:' || my_id, 0));

  key := case when p_goal is null
              then 'cheer_day:' || my_id || ':' || p_recipient || ':' || cheer_day
              else 'cheer_habit:' || my_id || ':' || p_goal || ':' || cheer_day end;

  -- The key is the limit. Inside a minute of the first it is the second half
  -- of a double tap, and reads as the success it is, with nothing to push.
  select created_at into first_sent from public.notifications where dedupe_key = key;
  if first_sent is not null then
    if first_sent > now() - interval '1 minute' then
      return json_build_object('success', true, 'message', 'Cheer sent');
    end if;
    select coalesce(nullif(split_part(btrim(full_name), ' ', 1), ''), 'them')
      into recipient_name from public.profiles where id = p_recipient;
    recipient_name := coalesce(recipient_name, 'them');
    return json_build_object('success', false, 'message',
      case when p_goal is null
           then 'You''ve already cheered '
                || case when recipient_name = 'them' then 'their' else recipient_name || '''s' end
                || ' day'
           else 'You''ve already cheered ' || recipient_name || ' for ' || goal_title end);
  end if;

  clean := btrim(regexp_replace(coalesce(p_message, ''), '\s*[\r\n]+\s*', ' ', 'g'), E' \t');
  clean := case when clean <> '' then rtrim(left(clean, 140))
                when p_goal is null then 'What a day! Keep it going 🔥'
                else left('Nice work on ' || goal_title || '!', 140) end;

  sender_name := public.social_first_name(my_id);

  insert into public.notifications
    (recipient_id, sender_id, group_id, type, title, body, data, dedupe_key)
  values
    (p_recipient, my_id, shared_group, 'cheer',
     case when p_goal is null then sender_name || ' cheered your day 🎉'
          else sender_name || ' cheered your ' || goal_title || coalesce(' ' || goal_icon, '') end,
     clean,
     jsonb_strip_nulls(jsonb_build_object(
       'type', 'cheer',
       'kind', case when p_goal is null then 'day' else 'habit' end,
       'sender_id', my_id, 'group_id', shared_group,
       'goal_id', p_goal, 'day', cheer_day)),
     key)
  on conflict (dedupe_key) do nothing
  returning id into new_id;

  return json_build_object('success', true, 'message', 'Cheer sent',
                           'notification_id', new_id);
end;
$function$;

revoke execute on function public.enqueue_cheer(uuid, text, uuid, date) from public, anon;
grant  execute on function public.enqueue_cheer(uuid, text, uuid, date) to authenticated;


-- ---------------------------------------------------------------------------
-- enqueue_social_events, restated: every push now carries the `day` it is
-- about, and a single-habit `buddy_ticked` also its `goal_id` and
-- `goal_title`, so a tap can open the right cheer. Otherwise identical to
-- 20261008180000_social_events.sql.
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
  _goal   jsonb;
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
                 jsonb_build_object('type', 'buddy_done', 'buddy_id', c.user_id, 'group_id', c.group_id,
                                    'day', c.day),
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
      -- One habit is named, for a habit cheer and its default line; several
      -- are a day cheer, so they name none.
      _goal := case when cardinality(_new) = 1 then
                 (select jsonb_build_object('goal_id', g.id, 'goal_title', g.title)
                    from public.goals g where g.id = _new[1])
               else '{}'::jsonb end;
      _body := case when _total > 0 then _done || ' of ' || _total || ' done today'
                    else 'Extra credit today.' end;
      return query
        with ins as (
          insert into public.notifications
            (recipient_id, sender_id, group_id, type, title, body, data, dedupe_key)
          select r, c.user_id, c.group_id, 'buddy_ticked',
                 _name || ' ticked ' || _title,
                 _body,
                 jsonb_build_object('type', 'buddy_ticked', 'buddy_id', c.user_id, 'group_id', c.group_id,
                                    'day', c.day) || _goal,
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
