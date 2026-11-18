-- Security review fixes (2026-11-16), third part. Tested in
-- supabase/tests/push_tokens.sql.
--
--   #6 `register_push_token` put no limit on how many tokens one account could
--      hold. Any signed-in caller could register thousands, and every push to
--      that account then fans out to all of them inside the dispatcher, which
--      sends one notification after another. A phone whose token changed also
--      left its old row behind for good.
--
-- Agreed with Piotr:
--
--   * An account keeps at most 10 registered phones. An eleventh is
--     registered and the one seen longest ago is dropped: a new phone always
--     works, and nobody is shown an error for a registration they never saw
--     happen.
--   * The same install (`device_id`, minted once per install by
--     `lib/deviceId.ts`) registering a new token replaces its own old row.
--   * A token still moves to whoever registers it. See below.


-- ---------------------------------------------------------------------------
-- register_push_token — as 20260916120000, plus the two rules above.
--
-- What it deliberately still does: a token registered by a second account
-- moves to that account. That is a phone switching accounts, and it is also
-- anyone who has learned another phone's token. The second cannot be told
-- from the first without device attestation: the install id does not help,
-- because a phone that was reinstalled and then signed in to a different
-- account has the same token and a new id, and refusing it would leave the
-- previous account's pushes arriving on that phone. What the move gives away
-- is small: tokens are readable only by their owner, the taker receives
-- nothing of the victim's (their own pushes go to the victim's phone
-- instead), and the phone takes its row back the next time it opens the app.
-- ---------------------------------------------------------------------------

create or replace function public.register_push_token(
  p_token     text,
  p_device_id text default null,
  p_platform  text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  my_id uuid := auth.uid();
begin
  if my_id is null then
    raise exception 'Not signed in';
  end if;

  -- Expo has issued both prefixes. Anything else is not a token this backend
  -- can send to, and storing it would only surface later as a failed ticket.
  if p_token is null
     or not (p_token like 'ExponentPushToken[%]' or p_token like 'ExpoPushToken[%]') then
    raise exception 'Invalid Expo push token';
  end if;

  -- Two registrations racing through the count below would each see room for
  -- one more. Serialise per account for the rest of the transaction.
  perform pg_advisory_xact_lock(hashtextextended('push_token:' || my_id, 0));

  insert into public.device_push_tokens (user_id, expo_push_token, device_id, platform)
  values (my_id, p_token, p_device_id, p_platform)
  on conflict (expo_push_token) do update
    set user_id      = excluded.user_id,
        device_id    = excluded.device_id,
        platform     = excluded.platform,
        last_seen_at = now();

  -- The same install with a new token: the old one is dead weight, and Expo
  -- may go on accepting it for a while.
  if p_device_id is not null then
    delete from public.device_push_tokens
     where user_id = my_id
       and device_id = p_device_id
       and expo_push_token <> p_token;
  end if;

  -- Ten phones. The row just written is the most recently seen, so it is
  -- never the one that goes.
  delete from public.device_push_tokens
   where id in (
     select id
       from public.device_push_tokens
      where user_id = my_id
      order by (expo_push_token = p_token) desc, last_seen_at desc, created_at desc, id
     offset 10
   );
end;
$function$;

revoke execute on function public.register_push_token(text, text, text) from public, anon;
grant  execute on function public.register_push_token(text, text, text) to authenticated;


-- Accounts already over the limit keep their ten most recently seen phones.
delete from public.device_push_tokens
 where id in (
   select id
     from (
       select id,
              row_number() over (
                partition by user_id
                order by last_seen_at desc, created_at desc, id
              ) as rn
         from public.device_push_tokens
     ) ranked
    where ranked.rn > 10
 );
