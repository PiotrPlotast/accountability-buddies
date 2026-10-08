-- Push receipts (E3 Phase 7, 2026-10-08): the hourly job that asks Expo what
-- happened to each push after the ticket, and what the database does with the
-- answer.
--
--   pending_push_receipts()       the ticket ids still worth asking about
--   record_push_receipts(jsonb)   Expo's `data` object, keyed by ticket id
--   record_push_tickets(...)      now also drops a token Expo already called
--                                 dead at send time
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/push_receipts.sql
-- Each case raises on failure; everything runs in one transaction that is
-- rolled back, so nothing is left behind.

begin;

create function pg_temp.mk_user()
  returns uuid language plpgsql as $$
declare _id uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (_id);
  return _id;
end $$;

create function pg_temp.mk_token(p_user uuid, p_token text)
  returns void language sql as $$
  insert into public.device_push_tokens (user_id, expo_push_token) values (p_user, p_token)
$$;

-- A notification already handed to Expo and marked sent.
create function pg_temp.mk_sent(p_user uuid)
  returns uuid language sql as $$
  insert into public.notifications
    (recipient_id, type, title, body, dedupe_key, status, sent_at)
  values (p_user, 'nudge', 't', 'b', 'test:' || gen_random_uuid(), 'sent', now())
  returning id
$$;

-- A ticket Expo accepted, `p_hours_ago` back.
create function pg_temp.mk_ticket(p_notification uuid, p_token text, p_ticket text, p_hours_ago int default 0)
  returns void language sql as $$
  insert into public.push_tickets (notification_id, expo_push_token, status, ticket_id, created_at)
  values (p_notification, p_token, 'ok', p_ticket, now() - make_interval(hours => p_hours_ago))
$$;

-- A ticket Expo refused at send time.
create function pg_temp.mk_error_ticket(p_notification uuid, p_token text, p_error text)
  returns void language sql as $$
  insert into public.push_tickets (notification_id, expo_push_token, status, error)
  values (p_notification, p_token, 'error', p_error)
$$;

create function pg_temp.receipt(p_ticket text)
  returns public.push_tickets language sql as $$
  select * from public.push_tickets where ticket_id = p_ticket
$$;

create function pg_temp.has_token(p_token text)
  returns boolean language sql as $$
  select exists (select 1 from public.device_push_tokens where expo_push_token = p_token)
$$;

create function pg_temp.notification(p_id uuid)
  returns public.notifications language sql as $$
  select * from public.notifications where id = p_id
$$;

create function pg_temp.pending()
  returns text[] language sql as $$
  select coalesce(array_agg(t order by t), '{}') from public.pending_push_receipts() as t
$$;

-- 1. Only accepted, unanswered tickets from the last 24 hours are asked about.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u);
begin
  perform pg_temp.mk_ticket(n, 'tok-1a', 'p-fresh', 0);
  perform pg_temp.mk_ticket(n, 'tok-1b', 'p-old', 25);
  perform pg_temp.mk_error_ticket(n, 'tok-1c', 'MessageTooBig');
  perform pg_temp.mk_ticket(n, 'tok-1d', 'p-answered', 1);
  update public.push_tickets set receipt_status = 'ok' where ticket_id = 'p-answered';

  if pg_temp.pending() <> array['p-fresh'] then
    raise exception 'case 1: expected only p-fresh, got %', pg_temp.pending();
  end if;
end $$;

-- 2. A delivered push is recorded and changes nothing else.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u); r public.push_tickets;
begin
  perform pg_temp.mk_token(u, 'tok-2');
  perform pg_temp.mk_ticket(n, 'tok-2', 't-2');
  perform public.record_push_receipts('{"t-2": {"status": "ok"}}');

  r := pg_temp.receipt('t-2');
  if r.receipt_status is distinct from 'ok' or r.receipt_error is not null or r.receipt_checked_at is null then
    raise exception 'case 2: expected an ok receipt with a check time, got %', row_to_json(r);
  end if;
  if not pg_temp.has_token('tok-2') then raise exception 'case 2: token was deleted'; end if;
  if (pg_temp.notification(n)).status <> 'sent' then raise exception 'case 2: notification changed'; end if;
  if 't-2' = any (pg_temp.pending()) then raise exception 'case 2: still pending'; end if;
end $$;

-- 3. DeviceNotRegistered deletes the token, whoever owns it now.
do $$
declare
  old_owner uuid := pg_temp.mk_user();
  new_owner uuid := pg_temp.mk_user();
  n uuid := pg_temp.mk_sent(old_owner);
  r public.push_tickets;
begin
  -- Sent to the old owner; the phone has since been signed in to another account.
  perform pg_temp.mk_token(new_owner, 'tok-3');
  perform pg_temp.mk_token(new_owner, 'tok-3-other-phone');
  perform pg_temp.mk_ticket(n, 'tok-3', 't-3');
  perform public.record_push_receipts(
    '{"t-3": {"status": "error", "message": "not registered", "details": {"error": "DeviceNotRegistered"}}}');

  r := pg_temp.receipt('t-3');
  if r.receipt_status is distinct from 'error' or r.receipt_error is distinct from 'DeviceNotRegistered' then
    raise exception 'case 3: expected a DeviceNotRegistered receipt, got %', row_to_json(r);
  end if;
  if pg_temp.has_token('tok-3') then raise exception 'case 3: dead token was kept'; end if;
  if not pg_temp.has_token('tok-3-other-phone') then raise exception 'case 3: deleted the owner''s other phone'; end if;
end $$;

-- 4. InvalidCredentials is our key, not the phone: the token stays.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u); r public.push_tickets;
begin
  perform pg_temp.mk_token(u, 'tok-4');
  perform pg_temp.mk_ticket(n, 'tok-4', 't-4');
  perform public.record_push_receipts(
    '{"t-4": {"status": "error", "message": "bad key", "details": {"error": "InvalidCredentials"}}}');

  r := pg_temp.receipt('t-4');
  if r.receipt_status is distinct from 'error' or r.receipt_error is distinct from 'InvalidCredentials' then
    raise exception 'case 4: expected an InvalidCredentials receipt, got %', row_to_json(r);
  end if;
  if not pg_temp.has_token('tok-4') then raise exception 'case 4: token deleted on a credentials error'; end if;
end $$;

-- 5. Any other error keeps the token too, and an error with no code keeps
--    Expo's message.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u);
begin
  perform pg_temp.mk_token(u, 'tok-5a');
  perform pg_temp.mk_token(u, 'tok-5b');
  perform pg_temp.mk_ticket(n, 'tok-5a', 't-5a');
  perform pg_temp.mk_ticket(n, 'tok-5b', 't-5b');
  perform public.record_push_receipts(
    '{"t-5a": {"status": "error", "details": {"error": "MessageRateExceeded"}},
      "t-5b": {"status": "error", "message": "Something odd"}}');

  if not pg_temp.has_token('tok-5a') or not pg_temp.has_token('tok-5b') then
    raise exception 'case 5: token deleted on a non-DeviceNotRegistered error';
  end if;
  if (pg_temp.receipt('t-5b')).receipt_error is distinct from 'Something odd' then
    raise exception 'case 5: expected the message, got %', (pg_temp.receipt('t-5b')).receipt_error;
  end if;
end $$;

-- 6. One phone got it: the notification stays sent.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u);
begin
  perform pg_temp.mk_ticket(n, 'tok-6a', 't-6a');
  perform pg_temp.mk_ticket(n, 'tok-6b', 't-6b');
  perform public.record_push_receipts(
    '{"t-6a": {"status": "ok"}, "t-6b": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}');

  if (pg_temp.notification(n)).status <> 'sent' or (pg_temp.notification(n)).error is not null then
    raise exception 'case 6: expected sent, got %', row_to_json(pg_temp.notification(n));
  end if;
end $$;

-- 7. Every phone failed at receipt time: failed, with the first error.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u); x public.notifications;
begin
  perform pg_temp.mk_ticket(n, 'tok-7a', 't-7a');
  perform pg_temp.mk_ticket(n, 'tok-7b', 't-7b');
  update public.push_tickets set created_at = created_at - interval '1 minute' where ticket_id = 't-7a';
  perform public.record_push_receipts(
    '{"t-7b": {"status": "error", "details": {"error": "MessageTooBig"}},
      "t-7a": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}');

  x := pg_temp.notification(n);
  if x.status <> 'failed' or x.error is distinct from 'DeviceNotRegistered' or x.sent_at is not null then
    raise exception 'case 7: expected failed with DeviceNotRegistered, got %', row_to_json(x);
  end if;
end $$;

-- 8. A send-time error plus a receipt error is also every phone failing.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u);
begin
  perform pg_temp.mk_error_ticket(n, 'tok-8a', 'MessageTooBig');
  perform pg_temp.mk_ticket(n, 'tok-8b', 't-8b');
  perform public.record_push_receipts('{"t-8b": {"status": "error", "details": {"error": "InvalidCredentials"}}}');

  if (pg_temp.notification(n)).status <> 'failed' then
    raise exception 'case 8: expected failed, got %', row_to_json(pg_temp.notification(n));
  end if;
end $$;

-- 9. A failure while another phone's receipt is still out: stays sent for now,
--    and the unanswered ticket is asked about again next run.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u);
begin
  perform pg_temp.mk_ticket(n, 'tok-9a', 't-9a');
  perform pg_temp.mk_ticket(n, 'tok-9b', 't-9b');
  perform public.record_push_receipts('{"t-9a": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}');

  if (pg_temp.notification(n)).status <> 'sent' then
    raise exception 'case 9: flipped to failed with a receipt still out';
  end if;
  if (pg_temp.receipt('t-9b')).receipt_status is not null then
    raise exception 'case 9: unanswered ticket was marked';
  end if;
  if not 't-9b' = any (pg_temp.pending()) then raise exception 'case 9: t-9b no longer pending'; end if;
end $$;

-- 10. After 24 hours with no receipt the ticket is expired, and an expired
--     ticket is not a failure.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u); r public.push_tickets;
begin
  perform pg_temp.mk_ticket(n, 'tok-10', 't-10', 25);
  perform public.record_push_receipts('{}');

  r := pg_temp.receipt('t-10');
  if r.receipt_status is distinct from 'expired' or r.receipt_checked_at is null then
    raise exception 'case 10: expected expired, got %', row_to_json(r);
  end if;
  if (pg_temp.notification(n)).status <> 'sent' then raise exception 'case 10: expiry changed the notification'; end if;
end $$;

-- 11. A receipt for a ticket we never stored is ignored.
do $$
begin
  perform public.record_push_receipts('{"no-such-ticket": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}');
end $$;

-- 12. A receipt that arrives twice changes nothing the second time.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u); first_check timestamptz;
begin
  perform pg_temp.mk_ticket(n, 'tok-12', 't-12');
  perform public.record_push_receipts('{"t-12": {"status": "ok"}}');
  first_check := (pg_temp.receipt('t-12')).receipt_checked_at;
  perform public.record_push_receipts('{"t-12": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}');

  if (pg_temp.receipt('t-12')).receipt_status <> 'ok'
     or (pg_temp.receipt('t-12')).receipt_checked_at <> first_check then
    raise exception 'case 12: an answered ticket was overwritten';
  end if;
end $$;

-- 13. DeviceNotRegistered at send time drops the token straight away; other
--     send-time errors keep it.
do $$
declare u uuid := pg_temp.mk_user(); n uuid := pg_temp.mk_sent(u);
begin
  perform pg_temp.mk_token(u, 'tok-13a');
  perform pg_temp.mk_token(u, 'tok-13b');
  perform public.record_push_tickets(n,
    '[{"token": "tok-13a", "status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}},
      {"token": "tok-13b", "status": "error", "message": "Expo push API responded 503"}]');

  if pg_temp.has_token('tok-13a') then raise exception 'case 13: dead token kept at send time'; end if;
  if not pg_temp.has_token('tok-13b') then raise exception 'case 13: token deleted on an outage'; end if;
end $$;

-- 14. Neither function is reachable from the app.
do $$
begin
  if has_function_privilege('authenticated', 'public.pending_push_receipts(integer)', 'execute')
     or has_function_privilege('anon', 'public.pending_push_receipts(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.record_push_receipts(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.record_push_receipts(jsonb)', 'execute') then
    raise exception 'case 14: a client role can execute the receipt functions';
  end if;
  if not has_function_privilege('service_role', 'public.record_push_receipts(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.pending_push_receipts(integer)', 'execute') then
    raise exception 'case 14: service_role cannot execute the receipt functions';
  end if;
end $$;

-- 15. The job runs hourly and calls check-receipts.
do $$
declare j record;
begin
  select * into j from cron.job where jobname = 'check-push-receipts';
  if j is null or j.schedule <> '0 * * * *' or j.command not like '%/functions/v1/check-receipts%' then
    raise exception 'case 15: expected an hourly check-receipts job, got %', row_to_json(j);
  end if;
end $$;

do $$ begin raise notice 'push_receipts: all cases passed'; end $$;

rollback;
