-- E4 — nudges, step 1: everything the send-nudge Edge Function decides before
-- it talks to Expo, and where it writes down what Expo said.
--
-- The rules live here rather than in the function so `supabase/tests/
-- send_nudge.sql` can pin them with psql, the way the streak rules are pinned.
-- The function is a thin courier: call enqueue_nudge() with the caller's JWT,
-- send what it lets through, hand the tickets to record_push_tickets().
--
-- A client calling enqueue_nudge() directly, without the function, gets
-- exactly the same rules and leaves a `pending` outbox row that nothing has
-- pushed yet — E5's dispatcher drains `pending`, so it is delivered late
-- rather than lost.


-- ---------------------------------------------------------------------------
-- push_tickets — one row per device a notification was handed to.
--
-- `notifications.ticket_id` assumed one ticket per notification, but a person
-- signed in on two phones gets two, and Phase 7's receipt job has to know
-- *which token* a `DeviceNotRegistered` belongs to before it can delete it.
-- Nothing has written that column yet, so it goes rather than lingering as a
-- second, half-true place to look.
-- ---------------------------------------------------------------------------

alter table public.notifications drop column ticket_id;

create table public.push_tickets (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  -- Text, not a foreign key: the token row may be deleted (sign-out, or the
  -- receipt job itself) while the ticket is still worth keeping.
  expo_push_token text not null,
  status          text not null check (status in ('ok', 'error')),
  -- Expo's ticket id, present only when `status = 'ok'` — it is what
  -- getReceipts takes.
  ticket_id       text,
  -- Expo's error code (`details.error`, e.g. `DeviceNotRegistered`), else its
  -- message.
  error           text,
  created_at      timestamptz not null default now()
);

create index push_tickets_notification_id_idx on public.push_tickets (notification_id);

-- Server-side only: no policies, no client grants. The service role bypasses
-- RLS.
alter table public.push_tickets enable row level security;
revoke all on table public.push_tickets from anon, authenticated;


-- ---------------------------------------------------------------------------
-- enqueue_nudge — the nudge rules, called with the sender's JWT.
--
-- Returns `{ success, message, notification_id }`, the `join_group_via_code`
-- convention. `notification_id` is present only when a new row was written:
-- a double tap inside the same minute reports success without one, so the
-- Edge Function has nothing to send a second time.
--
-- Recipient-side rejections (no shared group, unknown id, nudges switched
-- off) all read "Couldn't deliver that nudge": a sender must not be able to
-- probe who has turned them off. Sender-side ones (yourself, the limits) say
-- what happened, because the sender can act on them.
-- ---------------------------------------------------------------------------

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
         and created_at > now() - interval '24 hours') >= 3 then
    select coalesce(nullif(btrim(full_name), ''), 'them') into recipient_name
      from public.profiles where id = p_recipient;
    return json_build_object('success', false, 'message',
      'You''ve already nudged ' || coalesce(recipient_name, 'them')
      || ' 3 times in the last 24 hours');
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


-- ---------------------------------------------------------------------------
-- record_push_tickets — the write-back after Expo answers.
--
-- `p_tickets` is Expo's ticket array with the token each ticket was sent to
-- added as `token`. Sent if any device accepted it; failed otherwise, with the
-- first error — or "No registered devices" for an empty array, which is a
-- recipient who has never allowed notifications on any phone. The nudge still
-- counted as sent for the sender: they could not have known.
-- ---------------------------------------------------------------------------

create or replace function public.record_push_tickets(p_notification uuid, p_tickets jsonb)
  returns void
  language plpgsql
  set search_path = ''
as $function$
declare
  first_error text;
  any_ok      boolean;
begin
  insert into public.push_tickets (notification_id, expo_push_token, status, ticket_id, error)
  select p_notification,
         t->>'token',
         t->>'status',
         case when t->>'status' = 'ok' then t->>'id' end,
         case when t->>'status' = 'error' then coalesce(t->'details'->>'error', t->>'message') end
    from jsonb_array_elements(coalesce(p_tickets, '[]'::jsonb)) as t;

  select bool_or(t->>'status' = 'ok') into any_ok
    from jsonb_array_elements(coalesce(p_tickets, '[]'::jsonb)) as t;

  select coalesce(t->'details'->>'error', t->>'message') into first_error
    from jsonb_array_elements(coalesce(p_tickets, '[]'::jsonb)) with ordinality as e(t, i)
   where t->>'status' = 'error'
   order by i
   limit 1;

  update public.notifications
     set status  = case when any_ok then 'sent' else 'failed' end,
         sent_at = case when any_ok then now() end,
         error   = case when any_ok then null
                        when any_ok is null then 'No registered devices'
                        else first_error end
   where id = p_notification;
end;
$function$;

revoke execute on function public.record_push_tickets(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.record_push_tickets(uuid, jsonb) to service_role;
