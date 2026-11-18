-- Push token registration (security review, 2026-11-16). Agreed with Piotr:
--
--   * An account keeps at most 10 registered phones. An eleventh is
--     registered and the one seen longest ago is dropped, so a new phone
--     always works.
--   * A phone whose token changed replaces its own old row: same account,
--     same install id (`device_id`), new token.
--   * A token still moves to whoever registers it. That is how a phone that
--     switches accounts hands its row over, and it stays as it was.
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/push_tokens.sql
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

-- Registers as `p_user`, through the grants and policies a signed-in phone
-- has. Returns the SQLSTATE it failed with, or null.
create function pg_temp.register(p_user uuid, p_token text, p_device text default null)
  returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
  begin
    perform public.register_push_token(p_token, p_device, 'ios');
  exception when others then
    execute 'reset role';
    return sqlstate;
  end;
  execute 'reset role';
  return null;
end $$;

create function pg_temp.tokens_of(p_user uuid)
  returns text[] language sql as $$
  select coalesce(array_agg(expo_push_token order by expo_push_token), '{}')
    from public.device_push_tokens where user_id = p_user
$$;

create function pg_temp.expect(p_ok boolean, p_case text)
  returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAILED: %', p_case;
  end if;
end $$;

do $$
declare
  ada uuid := pg_temp.mk_user();
  bob uuid := pg_temp.mk_user();
  err text;
  i   int;
begin
  -- 1. A phone registers, and registering again is the same row.
  err := pg_temp.register(ada, 'ExponentPushToken[a1]', 'install-1');
  perform pg_temp.expect(err is null, '1: could not register: ' || coalesce(err, ''));
  err := pg_temp.register(ada, 'ExponentPushToken[a1]', 'install-1');
  perform pg_temp.expect(pg_temp.tokens_of(ada) = array['ExponentPushToken[a1]'],
                         '1: registering twice did not leave one row');

  -- 2. Anything that is not an Expo token is refused (unchanged).
  err := pg_temp.register(ada, 'not-a-token', 'install-1');
  perform pg_temp.expect(err is not null, '2: a non-Expo token was stored');

  -- 3. The same install with a new token replaces its old row.
  err := pg_temp.register(ada, 'ExponentPushToken[a1-rotated]', 'install-1');
  perform pg_temp.expect(err is null, '3: could not register the new token: ' || coalesce(err, ''));
  perform pg_temp.expect(pg_temp.tokens_of(ada) = array['ExponentPushToken[a1-rotated]'],
                         '3: the old token of the same install was kept: ' || pg_temp.tokens_of(ada)::text);

  -- 4. A second phone is a second row, and a phone that sends no install id
  --    replaces nobody.
  err := pg_temp.register(ada, 'ExponentPushToken[a2]', 'install-2');
  err := pg_temp.register(ada, 'ExponentPushToken[a3]', null);
  err := pg_temp.register(ada, 'ExponentPushToken[a4]', null);
  perform pg_temp.expect(cardinality(pg_temp.tokens_of(ada)) = 4,
                         '4: expected four phones, got ' || pg_temp.tokens_of(ada)::text);

  -- 5. Someone else's phone with the same install id is not touched: the
  --    replacement is within one account.
  err := pg_temp.register(bob, 'ExponentPushToken[b1]', 'install-1');
  perform pg_temp.expect(pg_temp.tokens_of(bob) = array['ExponentPushToken[b1]']
                           and cardinality(pg_temp.tokens_of(ada)) = 4,
                         '5: another account''s row was replaced');

  -- 6. Ten phones are kept. The eleventh registers and the one seen longest
  --    ago goes.
  delete from public.device_push_tokens where user_id = ada;
  for i in 1..10 loop
    err := pg_temp.register(ada, format('ExponentPushToken[p%s]', i), format('phone-%s', i));
    update public.device_push_tokens
       set last_seen_at = now() - make_interval(days => 20 - i)
     where expo_push_token = format('ExponentPushToken[p%s]', i);
  end loop;
  perform pg_temp.expect(cardinality(pg_temp.tokens_of(ada)) = 10, '6: ten phones were not all kept');
  err := pg_temp.register(ada, 'ExponentPushToken[p11]', 'phone-11');
  perform pg_temp.expect(err is null, '6: the eleventh phone was refused: ' || coalesce(err, ''));
  perform pg_temp.expect(cardinality(pg_temp.tokens_of(ada)) = 10,
                         '6: more than ten phones kept: ' || cardinality(pg_temp.tokens_of(ada)));
  perform pg_temp.expect('ExponentPushToken[p11]' = any (pg_temp.tokens_of(ada)),
                         '6: the new phone is not registered');
  perform pg_temp.expect(not 'ExponentPushToken[p1]' = any (pg_temp.tokens_of(ada)),
                         '6: the phone seen longest ago was kept');
  perform pg_temp.expect('ExponentPushToken[p2]' = any (pg_temp.tokens_of(ada)),
                         '6: a phone seen more recently was dropped');

  -- 7. A phone that registers again counts as seen now, so it is the last to
  --    go rather than the next.
  err := pg_temp.register(ada, 'ExponentPushToken[p2]', 'phone-2');
  err := pg_temp.register(ada, 'ExponentPushToken[p12]', 'phone-12');
  perform pg_temp.expect('ExponentPushToken[p2]' = any (pg_temp.tokens_of(ada))
                           and not 'ExponentPushToken[p3]' = any (pg_temp.tokens_of(ada)),
                         '7: the wrong phone was dropped: ' || pg_temp.tokens_of(ada)::text);

  -- 8. The limit is per account: none of this touched Bob's phone.
  perform pg_temp.expect(pg_temp.tokens_of(bob) = array['ExponentPushToken[b1]'],
                         '8: another account''s phone was dropped');

  -- 9. A phone that switches accounts takes its row with it (unchanged), and
  --    the account it left has one phone fewer.
  err := pg_temp.register(bob, 'ExponentPushToken[p12]', 'phone-12');
  perform pg_temp.expect(err is null, '9: could not take the row over: ' || coalesce(err, ''));
  perform pg_temp.expect('ExponentPushToken[p12]' = any (pg_temp.tokens_of(bob))
                           and not 'ExponentPushToken[p12]' = any (pg_temp.tokens_of(ada))
                           and cardinality(pg_temp.tokens_of(ada)) = 9,
                         '9: the row did not move to its new owner');

  -- 10. Signed-out callers cannot run it at all.
  perform pg_temp.expect(not has_function_privilege('anon', 'public.register_push_token(text, text, text)', 'execute'),
                         '10: anon can call register_push_token');
end $$;

\echo 'push_tokens: all cases passed'

rollback;
