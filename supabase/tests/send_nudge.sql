-- Nudge rules (2026-10-06): `enqueue_nudge(recipient, message)` is everything
-- the send-nudge Edge Function decides before it talks to Expo — the shared
-- group, the recipient's switch, the rate limits, the message clean-up and the
-- outbox row. The function only sends what this lets through.
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/send_nudge.sql
-- Each case raises on failure; everything runs in one transaction that is
-- rolled back, so nothing is left behind.
--
-- `now()` is fixed for the whole transaction, so every call here lands in the
-- same minute and shares a dedupe key. The rate-limit cases seed earlier
-- nudges directly instead of sending them.

begin;

create function pg_temp.mk_group()
  returns uuid language sql as $$
  insert into public.groups (name) values ('test') returning id
$$;

create function pg_temp.mk_user(p_name text)
  returns uuid language plpgsql as $$
declare _id uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (_id);
  insert into public.profiles (id, full_name) values (_id, p_name)
    on conflict (id) do update set full_name = excluded.full_name;
  insert into public.notification_prefs (user_id) values (_id)
    on conflict (user_id) do nothing;
  return _id;
end $$;

create function pg_temp.join(p_group uuid, p_user uuid)
  returns void language sql as $$
  insert into public.group_members (group_id, user_id) values (p_group, p_user)
$$;

create function pg_temp.as_user(p_user uuid)
  returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true)
$$;

-- An earlier nudge, `p_hours_ago` back, with a key of its own.
create function pg_temp.seed_nudge(p_from uuid, p_to uuid, p_hours_ago int)
  returns void language sql as $$
  insert into public.notifications
    (recipient_id, sender_id, type, title, body, dedupe_key, created_at)
  values
    (p_to, p_from, 'nudge', 't', 'b', 'seed:' || gen_random_uuid(),
     now() - make_interval(hours => p_hours_ago))
$$;

-- The same, `p_minutes_ago` back, for the 30-minute wait between nudges.
create function pg_temp.seed_nudge_minutes(p_from uuid, p_to uuid, p_minutes_ago int)
  returns void language sql as $$
  insert into public.notifications
    (recipient_id, sender_id, type, title, body, dedupe_key, created_at)
  values
    (p_to, p_from, 'nudge', 't', 'b', 'seed:' || gen_random_uuid(),
     now() - make_interval(mins => p_minutes_ago))
$$;

create function pg_temp.nudges_to(p_user uuid)
  returns int language sql as $$
  select count(*)::int from public.notifications
   where recipient_id = p_user and type = 'nudge' and dedupe_key not like 'seed:%'
$$;

create function pg_temp.expect_fail(p_res json, p_message text, p_case text)
  returns void language plpgsql as $$
begin
  if (p_res->>'success')::boolean is distinct from false
     or p_res->>'message' is distinct from p_message then
    raise exception '%: expected failure "%", got %', p_case, p_message, p_res;
  end if;
end $$;

-- 1. A buddy in the same group gets one pending outbox row, named after the sender.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        res json; n public.notifications;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  perform pg_temp.as_user(ada);
  res := public.enqueue_nudge(bo, '  What about your run?  ');
  if (res->>'success')::boolean is not true or res->>'notification_id' is null then
    raise exception 'happy path: expected success with an id, got %', res;
  end if;
  select * into n from public.notifications where id = (res->>'notification_id')::uuid;
  if n.recipient_id is distinct from bo or n.sender_id is distinct from ada or n.group_id is distinct from g or n.type is distinct from 'nudge'
     or n.status is distinct from 'pending' or n.title is distinct from 'Ada nudged you' or n.body is distinct from 'What about your run?' then
    raise exception 'happy path: unexpected row %', row_to_json(n);
  end if;
  if n.data->>'type' is distinct from 'nudge' or n.data->>'sender_id' is distinct from ada::text or n.data->>'group_id' is distinct from g::text then
    raise exception 'happy path: unexpected data %', n.data;
  end if;
  if n.dedupe_key is distinct from 'nudge:' || ada || ':' || bo || ':' || floor(extract(epoch from now()) / 60)::bigint then
    raise exception 'happy path: unexpected dedupe key %', n.dedupe_key;
  end if;
end $$;

-- 2. An empty or blank message is allowed and gets the default line.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        cy uuid := pg_temp.mk_user('Cy'); res json;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo); perform pg_temp.join(g, cy);
  perform pg_temp.as_user(ada);
  res := public.enqueue_nudge(bo, E'  \n ');
  if (select body from public.notifications where id = (res->>'notification_id')::uuid)
     is distinct from 'How are your habits going today?' then
    raise exception 'blank message: expected the default body, got %', res;
  end if;
  res := public.enqueue_nudge(cy, null);
  if (select body from public.notifications where id = (res->>'notification_id')::uuid)
     is distinct from 'How are your habits going today?' then
    raise exception 'null message: expected the default body, got %', res;
  end if;
end $$;

-- 3. Line breaks collapse to one space, and the server caps the body at 140.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        cy uuid := pg_temp.mk_user('Cy'); res json; b text;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo); perform pg_temp.join(g, cy);
  perform pg_temp.as_user(ada);
  res := public.enqueue_nudge(bo, E'Run\n\n  today?\r\nPlease');
  select body into b from public.notifications where id = (res->>'notification_id')::uuid;
  if b is distinct from 'Run today? Please' then
    raise exception 'newlines: expected "Run today? Please", got "%"', b;
  end if;
  res := public.enqueue_nudge(cy, repeat('x', 200));
  select body into b from public.notifications where id = (res->>'notification_id')::uuid;
  if char_length(b) is distinct from 140 then
    raise exception 'cap: expected 140 characters, got %', char_length(b);
  end if;
end $$;

-- 4. Nobody nudges themselves.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada');
begin
  perform pg_temp.join(g, ada);
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_fail(public.enqueue_nudge(ada, 'hi'), 'You can''t nudge yourself', 'self');
  if pg_temp.nudges_to(ada) is distinct from 0 then raise exception 'self: a row was written'; end if;
end $$;

-- 5. Recipient-side rejections all read the same, and write nothing: no shared
--    group, an unknown id, a null id, and nudges switched off.
do $$
declare g uuid := pg_temp.mk_group(); h uuid := pg_temp.mk_group();
        ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo'); cy uuid := pg_temp.mk_user('Cy');
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(h, bo);
  perform pg_temp.join(g, cy);
  update public.notification_prefs set nudges_enabled = false where user_id = cy;
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_fail(public.enqueue_nudge(bo, 'hi'), 'Couldn''t deliver that nudge', 'other group');
  perform pg_temp.expect_fail(public.enqueue_nudge(gen_random_uuid(), 'hi'), 'Couldn''t deliver that nudge', 'unknown id');
  perform pg_temp.expect_fail(public.enqueue_nudge(null, 'hi'), 'Couldn''t deliver that nudge', 'null id');
  perform pg_temp.expect_fail(public.enqueue_nudge(cy, 'hi'), 'Couldn''t deliver that nudge', 'nudges off');
  if pg_temp.nudges_to(bo) + pg_temp.nudges_to(cy) is distinct from 0 then
    raise exception 'recipient rejections: a row was written';
  end if;
end $$;

-- 6. Ten nudges per buddy in a rolling 24 hours; one from 25 hours ago is spent.
--    The refusal uses a second sender, so the 15-a-day total can't be what
--    stops it.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        cy uuid := pg_temp.mk_user('Cy'); di uuid := pg_temp.mk_user('Di'); res json;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  perform pg_temp.join(g, cy); perform pg_temp.join(g, di);
  perform pg_temp.seed_nudge(ada, bo, 25);
  for i in 1..9 loop
    perform pg_temp.seed_nudge(ada, bo, i);
  end loop;
  perform pg_temp.as_user(ada);
  res := public.enqueue_nudge(bo, 'tenth');
  if (res->>'success')::boolean is not true then
    raise exception 'per buddy: the tenth in 24h should go through, got %', res;
  end if;
  for i in 1..10 loop
    perform pg_temp.seed_nudge(di, cy, 1);
  end loop;
  perform pg_temp.as_user(di);
  perform pg_temp.expect_fail(public.enqueue_nudge(cy, 'eleventh'),
    'You''ve already nudged Cy 10 times in the last 24 hours', 'per buddy limit');
  if pg_temp.nudges_to(cy) is distinct from 0 then raise exception 'per buddy limit: a row was written'; end if;
end $$;

-- 6b. Thirty minutes between nudges to the same buddy. The refusal says how
--     long is left, rounded up; another buddy is not held up; and a nudge
--     31 minutes ago no longer blocks.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        cy uuid := pg_temp.mk_user('Cy'); di uuid := pg_temp.mk_user('Di'); res json;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  perform pg_temp.join(g, cy); perform pg_temp.join(g, di);
  perform pg_temp.seed_nudge_minutes(ada, bo, 25);
  perform pg_temp.seed_nudge_minutes(ada, di, 29);
  perform pg_temp.seed_nudge_minutes(ada, cy, 31);
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_fail(public.enqueue_nudge(bo, 'again'),
    'You can nudge Bo again in 5 minutes', 'cooldown');
  perform pg_temp.expect_fail(public.enqueue_nudge(di, 'again'),
    'You can nudge Di again in 1 minute', 'cooldown, singular');
  if pg_temp.nudges_to(bo) + pg_temp.nudges_to(di) is distinct from 0 then
    raise exception 'cooldown: a row was written';
  end if;
  res := public.enqueue_nudge(cy, 'after the wait');
  if (res->>'success')::boolean is not true then
    raise exception 'cooldown: 31 minutes later should go through, got %', res;
  end if;
end $$;

-- 7. Fifteen nudges in total in a rolling 24 hours, whoever they went to.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        others uuid[] := '{}'; u uuid;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  for i in 1..5 loop
    u := pg_temp.mk_user('Other');
    perform pg_temp.join(g, u);
    perform pg_temp.seed_nudge(ada, u, 3);
    perform pg_temp.seed_nudge(ada, u, 3);
    perform pg_temp.seed_nudge(ada, u, 3);
  end loop;
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_fail(public.enqueue_nudge(bo, 'hi'),
    'You''ve sent 15 nudges in the last 24 hours', 'total limit');
  if pg_temp.nudges_to(bo) is distinct from 0 then raise exception 'total limit: a row was written'; end if;
end $$;

-- 8. A double tap in the same minute succeeds without a second row or a second
--    push: no notification_id comes back, so the Edge Function sends nothing.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        res json;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  perform pg_temp.as_user(ada);
  perform public.enqueue_nudge(bo, 'hi');
  res := public.enqueue_nudge(bo, 'hi');
  if (res->>'success')::boolean is not true or res->>'notification_id' is not null then
    raise exception 'double tap: expected success without an id, got %', res;
  end if;
  if pg_temp.nudges_to(bo) is distinct from 1 then
    raise exception 'double tap: expected one row, got %', pg_temp.nudges_to(bo);
  end if;
end $$;

-- 9. Signed out gets a failure, not an exception.
do $$
declare g uuid := pg_temp.mk_group(); bo uuid := pg_temp.mk_user('Bo');
begin
  perform pg_temp.join(g, bo);
  perform pg_temp.as_user(null);
  perform pg_temp.expect_fail(public.enqueue_nudge(bo, 'hi'), 'Not signed in', 'signed out');
end $$;

-- 10. Signed-in users may call it; anon may not.
do $$
begin
  if not has_function_privilege('authenticated', 'public.enqueue_nudge(uuid, text)', 'execute') then
    raise exception 'grants: authenticated cannot execute enqueue_nudge';
  end if;
  if has_function_privilege('anon', 'public.enqueue_nudge(uuid, text)', 'execute') then
    raise exception 'grants: anon can execute enqueue_nudge';
  end if;
end $$;

-- record_push_tickets(notification, tickets) is the Edge Function's write-back
-- after Expo answers: one push_tickets row per device, and the outbox row's
-- status. Tickets are Expo's own shape plus the token they were sent to.

create function pg_temp.pending_nudge()
  returns uuid language plpgsql as $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  perform pg_temp.as_user(ada);
  return (public.enqueue_nudge(bo, 'hi')->>'notification_id')::uuid;
end $$;

-- 11. Every device accepted: sent, with a ticket per device.
do $$
declare nid uuid := pg_temp.pending_nudge(); n public.notifications;
begin
  perform public.record_push_tickets(nid, '[
    {"token": "ExponentPushToken[a]", "status": "ok", "id": "ticket-a"},
    {"token": "ExponentPushToken[b]", "status": "ok", "id": "ticket-b"}
  ]'::jsonb);
  select * into n from public.notifications where id = nid;
  if n.status is distinct from 'sent' or n.sent_at is null or n.error is not null then
    raise exception 'all ok: unexpected row %', row_to_json(n);
  end if;
  if (select count(*) from public.push_tickets
       where notification_id = nid and status = 'ok'
         and (expo_push_token, ticket_id) in (('ExponentPushToken[a]', 'ticket-a'),
                                              ('ExponentPushToken[b]', 'ticket-b'))) is distinct from 2 then
    raise exception 'all ok: expected two ok tickets';
  end if;
end $$;

-- 12. One device gone, one accepted: still sent; the dead one is on record
--     with Expo's error code, for the receipts job to act on.
do $$
declare nid uuid := pg_temp.pending_nudge(); n public.notifications; t public.push_tickets;
begin
  perform public.record_push_tickets(nid, '[
    {"token": "ExponentPushToken[a]", "status": "ok", "id": "ticket-a"},
    {"token": "ExponentPushToken[b]", "status": "error", "message": "not registered",
     "details": {"error": "DeviceNotRegistered"}}
  ]'::jsonb);
  select * into n from public.notifications where id = nid;
  if n.status is distinct from 'sent' then
    raise exception 'mixed: expected sent, got %', n.status;
  end if;
  select * into t from public.push_tickets
   where notification_id = nid and expo_push_token = 'ExponentPushToken[b]';
  if t.status is distinct from 'error' or t.error is distinct from 'DeviceNotRegistered' or t.ticket_id is not null then
    raise exception 'mixed: unexpected error ticket %', row_to_json(t);
  end if;
end $$;

-- 13. Every device refused: failed, with the first error on the outbox row.
--     A ticket error without a code falls back to Expo's message.
do $$
declare nid uuid := pg_temp.pending_nudge(); n public.notifications;
begin
  perform public.record_push_tickets(nid, '[
    {"token": "ExponentPushToken[a]", "status": "error", "message": "Too many requests"},
    {"token": "ExponentPushToken[b]", "status": "error", "message": "x",
     "details": {"error": "DeviceNotRegistered"}}
  ]'::jsonb);
  select * into n from public.notifications where id = nid;
  if n.status is distinct from 'failed' or n.error is distinct from 'Too many requests' or n.sent_at is not null then
    raise exception 'all error: unexpected row %', row_to_json(n);
  end if;
end $$;

-- 14. No registered device: kept, marked failed, and says why.
do $$
declare nid uuid := pg_temp.pending_nudge(); n public.notifications;
begin
  perform public.record_push_tickets(nid, '[]'::jsonb);
  select * into n from public.notifications where id = nid;
  if n.status is distinct from 'failed' or n.error is distinct from 'No registered devices' then
    raise exception 'no devices: unexpected row %', row_to_json(n);
  end if;
end $$;

-- 15. Only the service role writes delivery results, and nobody else reads them.
do $$
begin
  if not has_function_privilege('service_role', 'public.record_push_tickets(uuid, jsonb)', 'execute') then
    raise exception 'grants: service_role cannot execute record_push_tickets';
  end if;
  if has_function_privilege('authenticated', 'public.record_push_tickets(uuid, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.record_push_tickets(uuid, jsonb)', 'execute') then
    raise exception 'grants: a client role can execute record_push_tickets';
  end if;
  if has_table_privilege('authenticated', 'public.push_tickets', 'select')
     or has_table_privilege('anon', 'public.push_tickets', 'select') then
    raise exception 'grants: a client role can read push_tickets';
  end if;
end $$;

\echo 'send_nudge: all cases passed'

rollback;
