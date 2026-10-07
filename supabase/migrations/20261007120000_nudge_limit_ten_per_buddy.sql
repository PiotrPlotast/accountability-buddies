-- Raise the per-buddy nudge limit from 3 to 10 in a rolling 24 hours
-- (2026-10-07). The 15-a-day total per sender is unchanged, so it now binds
-- first for anyone nudging more than one buddy heavily.
--
-- The whole function is restated because Postgres has no way to patch one
-- line of a function body; everything except the two "3"s is identical to
-- 20261006120000_send_nudge.sql. Pinned by case 6 of
-- supabase/tests/send_nudge.sql.

create or replace function public.enqueue_nudge(p_recipient uuid, p_message text default null)
  returns json
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  my_id          uuid := auth.uid();
  shared_group   uuid;
  sender_name    text;
  recipient_name text;
  clean          text;
  key            text;
  new_id         uuid;
begin
  if my_id is null then
    return json_build_object('success', false, 'message', 'Not signed in');
  end if;

  if p_recipient = my_id then
    return json_build_object('success', false, 'message', 'You can''t nudge yourself');
  end if;

  select a.group_id into shared_group
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id
   where a.user_id = my_id and b.user_id = p_recipient
   order by a.group_id
   limit 1;

  if shared_group is null
     or not exists (select 1 from public.notification_prefs
                     where user_id = p_recipient and nudges_enabled) then
    return json_build_object('success', false, 'message', 'Couldn''t deliver that nudge');
  end if;

  -- Two taps racing through the count below would both see room for one more.
  -- Serialise per sender for the rest of the transaction.
  perform pg_advisory_xact_lock(hashtextextended('nudge:' || my_id, 0));

  -- Checked before the limits, so the second half of a double tap on your
  -- third nudge reads as the success it is, not as a limit.
  key := 'nudge:' || my_id || ':' || p_recipient || ':'
         || floor(extract(epoch from now()) / 60)::bigint;
  if exists (select 1 from public.notifications where dedupe_key = key) then
    return json_build_object('success', true, 'message', 'Nudge sent');
  end if;

  -- Rolling 24 hours, not the calendar day: nobody gets a fresh allowance at
  -- midnight, and there is no timezone to argue about.
  if (select count(*) from public.notifications
       where sender_id = my_id and recipient_id = p_recipient and type = 'nudge'
         and created_at > now() - interval '24 hours') >= 10 then
    select coalesce(nullif(btrim(full_name), ''), 'them') into recipient_name
      from public.profiles where id = p_recipient;
    return json_build_object('success', false, 'message',
      'You''ve already nudged ' || coalesce(recipient_name, 'them')
      || ' 10 times in the last 24 hours');
  end if;

  if (select count(*) from public.notifications
       where sender_id = my_id and type = 'nudge'
         and created_at > now() - interval '24 hours') >= 15 then
    return json_build_object('success', false, 'message',
      'You''ve sent 15 nudges in the last 24 hours');
  end if;

  -- Line breaks become one space, the ends are trimmed, and the cap is 140.
  -- The client's `maxLength` is a convenience; this is the enforcement.
  clean := btrim(regexp_replace(coalesce(p_message, ''), '\s*[\r\n]+\s*', ' ', 'g'), E' \t');
  clean := case when clean = '' then 'How are your habits going today?'
                else rtrim(left(clean, 140)) end;

  -- Rendered now, not at delivery: a later rename or account deletion must
  -- not rewrite what someone already received.
  select coalesce(nullif(btrim(full_name), ''), 'Your buddy') into sender_name
    from public.profiles where id = my_id;

  insert into public.notifications
    (recipient_id, sender_id, group_id, type, title, body, data, dedupe_key)
  values
    (p_recipient, my_id, shared_group, 'nudge',
     coalesce(sender_name, 'Your buddy') || ' nudged you', clean,
     jsonb_build_object('type', 'nudge', 'sender_id', my_id, 'group_id', shared_group),
     key)
  on conflict (dedupe_key) do nothing
  returning id into new_id;

  return json_build_object('success', true, 'message', 'Nudge sent',
                           'notification_id', new_id);
end;
$function$;

revoke execute on function public.enqueue_nudge(uuid, text) from public, anon;
grant  execute on function public.enqueue_nudge(uuid, text) to authenticated;
