-- E3 — push infrastructure, Phase 7 of todo/push-notifications.md: receipts
-- and token hygiene.
--
-- A ticket only says Expo accepted a push. Whether Apple or Google took it is
-- in a receipt, ready about 15 minutes later and deleted after 24 hours. Once
-- an hour pg_cron calls the check-receipts Edge Function, which asks
-- pending_push_receipts() what to look up, fetches the receipts from Expo and
-- hands them to record_push_receipts(). Everything that decides lives here,
-- tested in `supabase/tests/push_receipts.sql`; the function is a courier.
--
-- The one rule that matters most: only `DeviceNotRegistered` deletes a token.
-- `InvalidCredentials` means our APNs/FCM key is wrong, not that the phone is
-- gone — treating the two alike would delete every live token the first time
-- a key expires.


-- ---------------------------------------------------------------------------
-- push_tickets — what the receipt said.
--
-- `receipt_status` is null while Expo has not answered, then `ok`, `error`, or
-- `expired` when 24 hours passed without an answer (Expo has deleted the
-- receipt by then, so asking again is pointless).
-- ---------------------------------------------------------------------------

alter table public.push_tickets
  add column receipt_status     text check (receipt_status in ('ok', 'error', 'expired')),
  add column receipt_error      text,
  add column receipt_checked_at timestamptz;

-- The hourly lookup. Partial, so it stays the size of the last day's sends.
create index push_tickets_awaiting_receipt_idx on public.push_tickets (created_at)
  where status = 'ok' and receipt_status is null;


-- ---------------------------------------------------------------------------
-- pending_push_receipts — the ticket ids worth asking Expo about.
-- ---------------------------------------------------------------------------

create or replace function public.pending_push_receipts(p_limit int default 10000)
  returns setof text
  language sql
  stable
  set search_path = ''
as $function$
  select ticket_id
    from public.push_tickets
   where status = 'ok'
     and receipt_status is null
     and ticket_id is not null
     and created_at > now() - interval '24 hours'
   order by created_at
   limit p_limit
$function$;

revoke execute on function public.pending_push_receipts(int) from public, anon, authenticated;
grant  execute on function public.pending_push_receipts(int) to service_role;


-- ---------------------------------------------------------------------------
-- record_push_receipts — the write-back after Expo answers.
--
-- `p_receipts` is Expo's `data` object as it comes: `{ "<ticket id>": {
-- status, message?, details?: { error? } } }`. A ticket missing from it has no
-- receipt yet and is asked about again next run. An answered ticket is never
-- overwritten. Then, in order:
--   1. tokens whose receipt says DeviceNotRegistered are deleted, by token —
--      whoever owns the row now, and never the owner's other phones;
--   2. tickets 24 hours old with no answer become `expired`;
--   3. a `sent` notification whose every ticket has now failed becomes
--      `failed` with its first error. One delivered, unanswered or expired
--      ticket keeps it `sent`. The sender is not told: they were already told
--      it went.
-- ---------------------------------------------------------------------------

create or replace function public.record_push_receipts(p_receipts jsonb)
  returns void
  language plpgsql
  set search_path = ''
as $function$
declare
  touched uuid[];
begin
  with answered as (
    update public.push_tickets pt
       set receipt_status     = r.value->>'status',
           receipt_error      = case when r.value->>'status' = 'error'
                                     then coalesce(r.value->'details'->>'error', r.value->>'message') end,
           receipt_checked_at = now()
      from jsonb_each(coalesce(p_receipts, '{}'::jsonb)) as r
     where pt.ticket_id = r.key
       and pt.status = 'ok'
       and pt.receipt_status is null
       and r.value->>'status' in ('ok', 'error')
    returning pt.notification_id, pt.expo_push_token, pt.receipt_error
  ), dead as (
    delete from public.device_push_tokens t
     using answered a
     where a.receipt_error = 'DeviceNotRegistered'
       and t.expo_push_token = a.expo_push_token
  )
  select coalesce(array_agg(distinct notification_id), '{}') into touched
    from answered
   where receipt_error is not null;

  update public.push_tickets
     set receipt_status = 'expired',
         receipt_checked_at = now()
   where status = 'ok'
     and receipt_status is null
     and created_at <= now() - interval '24 hours';

  update public.notifications n
     set status  = 'failed',
         sent_at = null,
         error   = (select coalesce(pt.receipt_error, pt.error)
                      from public.push_tickets pt
                     where pt.notification_id = n.id
                     order by pt.created_at, pt.id
                     limit 1)
   where n.id = any (touched)
     and n.status = 'sent'
     and not exists (
       select 1 from public.push_tickets pt
        where pt.notification_id = n.id
          and pt.status = 'ok'
          and pt.receipt_status is distinct from 'error'
     );
end;
$function$;

revoke execute on function public.record_push_receipts(jsonb) from public, anon, authenticated;
grant  execute on function public.record_push_receipts(jsonb) to service_role;


-- ---------------------------------------------------------------------------
-- record_push_tickets — unchanged, except that a token Expo already calls
-- DeviceNotRegistered at send time is dropped there and then. It is the same
-- signal as the receipt, only earlier; any other send-time error (an outage,
-- a 5xx turned into an error ticket by expoPush.ts) keeps the token.
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

  delete from public.device_push_tokens
   where expo_push_token in (
     select t->>'token'
       from jsonb_array_elements(coalesce(p_tickets, '[]'::jsonb)) as t
      where t->>'status' = 'error'
        and t->'details'->>'error' = 'DeviceNotRegistered'
   );

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


-- ---------------------------------------------------------------------------
-- The hourly job.
--
-- The project URL and the shared secret come from Vault, so neither is in
-- git. Both have to exist before the first run (see the PR / README):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random>', 'dispatch_secret');
-- and the same secret on the function side:
--   npx supabase secrets set DISPATCH_SECRET=<random>
-- A run before they exist posts to a null URL and fails harmlessly; the next
-- run after they are set picks up everything from the last 24 hours.
-- ---------------------------------------------------------------------------

select cron.schedule(
  'check-push-receipts',
  '0 * * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/check-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_secret')
    ),
    body    := '{}'::jsonb
  );
  $job$
);
