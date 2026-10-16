-- Cheer rules (E7, 2026-10-16): `enqueue_cheer(recipient, message, goal, day)`
-- is everything the send-cheer Edge Function decides before it talks to Expo.
-- Agreed with Piotr:
--
--   * Two kinds, worded differently: a habit cheer (`p_goal` set: "Ada
--     cheered your Run 🏃") and a day cheer (no goal: "Ada cheered your
--     day 🎉").
--   * One cheer per habit per day, and one day cheer per buddy per day, from
--     each sender. No other limit.
--   * Receiving them follows the Social switch.
--   * A habit unticked in the meantime is cheered anyway.
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/send_cheer.sql
-- Each case raises on failure; everything runs in one transaction that is
-- rolled back, so nothing is left behind.
--
-- `now()` is fixed for the whole transaction. A case that needs an earlier
-- cheer sends it and then moves its `created_at` back.

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

create function pg_temp.mk_goal(p_user uuid, p_group uuid, p_title text, p_icon text default null)
  returns uuid language sql as $$
  insert into public.goals (user_id, group_id, title, icon)
  values (p_user, p_group, p_title, p_icon) returning id
$$;

create function pg_temp.as_user(p_user uuid)
  returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true)
$$;

create function pg_temp.cheers_to(p_user uuid)
  returns int language sql as $$
  select count(*)::int from public.notifications
   where recipient_id = p_user and type = 'cheer'
$$;

-- Moves every cheer `p_from` has sent back by `p_minutes`, so the next one is
-- not read as the second half of a double tap.
create function pg_temp.age_cheers(p_from uuid, p_minutes int default 5)
  returns void language sql as $$
  update public.notifications
     set created_at = created_at - make_interval(mins => p_minutes)
   where sender_id = p_from and type = 'cheer'
$$;

create function pg_temp.expect_ok(p_res json, p_case text)
  returns uuid language plpgsql as $$
begin
  if (p_res->>'success')::boolean is not true or p_res->>'notification_id' is null then
    raise exception '%: expected success with an id, got %', p_case, p_res;
  end if;
  return (p_res->>'notification_id')::uuid;
end $$;

-- The row a successful call wrote. plpgsql, so the call it is handed runs
-- once rather than once per row scanned.
create function pg_temp.sent(p_res json, p_case text)
  returns public.notifications language plpgsql as $$
declare _id uuid := pg_temp.expect_ok(p_res, p_case); n public.notifications;
begin
  select * into n from public.notifications where id = _id;
  return n;
end $$;

create function pg_temp.expect_fail(p_res json, p_message text, p_case text)
  returns void language plpgsql as $$
begin
  if (p_res->>'success')::boolean is distinct from false
     or p_res->>'message' is distinct from p_message then
    raise exception '%: expected failure "%", got %', p_case, p_message, p_res;
  end if;
end $$;


-- 1. A habit cheer: one pending row for the habit's owner, titled with the
--    sender's first name and the habit, carrying what a tap needs. The habit
--    was never ticked: it is cheered anyway.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada Lovelace'); bo uuid := pg_temp.mk_user('Bo');
        run uuid; res json; n public.notifications;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  run := pg_temp.mk_goal(bo, g, 'Run', '🏃');
  perform pg_temp.as_user(ada);
  res := public.enqueue_cheer(bo, '  Nice one!  ', run, current_date);
  n := pg_temp.sent(res, 'habit cheer');
  if n.recipient_id is distinct from bo or n.sender_id is distinct from ada or n.group_id is distinct from g
     or n.type is distinct from 'cheer' or n.status is distinct from 'pending'
     or n.title is distinct from 'Ada cheered your Run 🏃' or n.body is distinct from 'Nice one!' then
    raise exception 'habit cheer: unexpected row %', row_to_json(n);
  end if;
  if n.data->>'type' is distinct from 'cheer' or n.data->>'kind' is distinct from 'habit'
     or n.data->>'sender_id' is distinct from ada::text or n.data->>'group_id' is distinct from g::text
     or n.data->>'goal_id' is distinct from run::text or n.data->>'day' is distinct from current_date::text then
    raise exception 'habit cheer: unexpected data %', n.data;
  end if;
  if n.dedupe_key is distinct from 'cheer_habit:' || ada || ':' || run || ':' || current_date then
    raise exception 'habit cheer: unexpected dedupe key %', n.dedupe_key;
  end if;
  if res->>'message' is distinct from 'Cheer sent' then
    raise exception 'habit cheer: unexpected message %', res;
  end if;
end $$;

-- 2. A day cheer: no goal, its own title, no goal_id in the data. A habit
--    with no icon gets none in a habit cheer's title.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        plain uuid; n public.notifications;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  plain := pg_temp.mk_goal(bo, g, 'Stretch');
  perform pg_temp.as_user(ada);
  n := pg_temp.sent(public.enqueue_cheer(bo, 'Great day', null, current_date), 'day cheer');
  if n.title is distinct from 'Ada cheered your day 🎉' or n.body is distinct from 'Great day'
     or n.group_id is distinct from g then
    raise exception 'day cheer: unexpected row %', row_to_json(n);
  end if;
  if n.data->>'kind' is distinct from 'day' or n.data ? 'goal_id'
     or n.data->>'day' is distinct from current_date::text then
    raise exception 'day cheer: unexpected data %', n.data;
  end if;
  if n.dedupe_key is distinct from 'cheer_day:' || ada || ':' || bo || ':' || current_date then
    raise exception 'day cheer: unexpected dedupe key %', n.dedupe_key;
  end if;
  n := pg_temp.sent(public.enqueue_cheer(bo, 'hi', plain, current_date), 'no icon');
  if n.title is distinct from 'Ada cheered your Stretch' then
    raise exception 'no icon: unexpected title "%"', n.title;
  end if;
end $$;

-- 3. A blank or missing message gets a default line of its kind; line breaks
--    collapse and the cap is 140.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        cy uuid := pg_temp.mk_user('Cy'); read uuid; b text;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo); perform pg_temp.join(g, cy);
  read := pg_temp.mk_goal(bo, g, 'Read 20 pages', '📚');
  perform pg_temp.as_user(ada);
  b := (pg_temp.sent(public.enqueue_cheer(bo, E'  \n ', read, current_date), 'blank habit')).body;
  if b is distinct from 'Nice work on Read 20 pages!' then
    raise exception 'blank habit: expected the habit default, got "%"', b;
  end if;
  b := (pg_temp.sent(public.enqueue_cheer(bo, null, null, current_date), 'null day')).body;
  if b is distinct from 'What a day! Keep it going 🔥' then
    raise exception 'null day: expected the day default, got "%"', b;
  end if;
  b := (pg_temp.sent(public.enqueue_cheer(cy, E'So\n\n  proud\r\nof you', null, current_date), 'newlines')).body;
  if b is distinct from 'So proud of you' then
    raise exception 'newlines: expected "So proud of you", got "%"', b;
  end if;
  perform pg_temp.age_cheers(ada);
  delete from public.notifications where sender_id = ada and recipient_id = cy;
  b := (pg_temp.sent(public.enqueue_cheer(cy, repeat('x', 200), null, current_date), 'cap')).body;
  if char_length(b) is distinct from 140 then
    raise exception 'cap: expected 140 characters, got %', char_length(b);
  end if;
end $$;

-- 4. Nobody cheers themselves, a habit or their day.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); mine uuid;
begin
  perform pg_temp.join(g, ada);
  mine := pg_temp.mk_goal(ada, g, 'Run');
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_fail(public.enqueue_cheer(ada, 'hi', null, current_date), 'You can''t cheer yourself', 'self, day');
  perform pg_temp.expect_fail(public.enqueue_cheer(ada, 'hi', mine, current_date), 'You can''t cheer yourself', 'self, habit');
  if pg_temp.cheers_to(ada) is distinct from 0 then raise exception 'self: a row was written'; end if;
end $$;

-- 5. Recipient-side rejections all read the same and write nothing: no shared
--    group, an unknown or null id, Social switched off, a habit that isn't the
--    recipient's, and the recipient's habit in a group the sender isn't in.
do $$
declare g uuid := pg_temp.mk_group(); h uuid := pg_temp.mk_group();
        ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo'); cy uuid := pg_temp.mk_user('Cy');
        di uuid := pg_temp.mk_user('Di');
        cys uuid; dis_elsewhere uuid; adas uuid;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(h, bo);
  perform pg_temp.join(g, cy); perform pg_temp.join(g, di); perform pg_temp.join(h, di);
  update public.notification_prefs set social_enabled = false where user_id = cy;
  cys := pg_temp.mk_goal(cy, g, 'Run');
  adas := pg_temp.mk_goal(ada, g, 'Run');
  dis_elsewhere := pg_temp.mk_goal(di, h, 'Swim');
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_fail(public.enqueue_cheer(bo, 'hi', null, current_date), 'Couldn''t deliver that cheer', 'other group');
  perform pg_temp.expect_fail(public.enqueue_cheer(gen_random_uuid(), 'hi', null, current_date), 'Couldn''t deliver that cheer', 'unknown id');
  perform pg_temp.expect_fail(public.enqueue_cheer(null, 'hi', null, current_date), 'Couldn''t deliver that cheer', 'null id');
  perform pg_temp.expect_fail(public.enqueue_cheer(cy, 'hi', null, current_date), 'Couldn''t deliver that cheer', 'social off, day');
  perform pg_temp.expect_fail(public.enqueue_cheer(cy, 'hi', cys, current_date), 'Couldn''t deliver that cheer', 'social off, habit');
  perform pg_temp.expect_fail(public.enqueue_cheer(di, 'hi', cys, current_date), 'Couldn''t deliver that cheer', 'someone else''s habit');
  perform pg_temp.expect_fail(public.enqueue_cheer(di, 'hi', adas, current_date), 'Couldn''t deliver that cheer', 'the sender''s habit');
  perform pg_temp.expect_fail(public.enqueue_cheer(di, 'hi', dis_elsewhere, current_date), 'Couldn''t deliver that cheer', 'habit in an unshared group');
  perform pg_temp.expect_fail(public.enqueue_cheer(di, 'hi', gen_random_uuid(), current_date), 'Couldn''t deliver that cheer', 'unknown habit');
  if pg_temp.cheers_to(bo) + pg_temp.cheers_to(cy) + pg_temp.cheers_to(di) is distinct from 0 then
    raise exception 'recipient rejections: a row was written';
  end if;
end $$;

-- 6. One cheer per habit per day from each sender. A second one later reads
--    as a limit and names the habit; another habit, another sender and
--    another day each still go through.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo Smith');
        cy uuid := pg_temp.mk_user('Cy'); run uuid; read uuid;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo); perform pg_temp.join(g, cy);
  run := pg_temp.mk_goal(bo, g, 'Run', '🏃');
  read := pg_temp.mk_goal(bo, g, 'Read');
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_ok(public.enqueue_cheer(bo, 'one', run, current_date), 'first habit cheer');
  perform pg_temp.age_cheers(ada);
  perform pg_temp.expect_fail(public.enqueue_cheer(bo, 'two', run, current_date),
    'You''ve already cheered Bo for Run', 'same habit, same day');
  perform pg_temp.expect_ok(public.enqueue_cheer(bo, 'other', read, current_date), 'another habit');
  perform pg_temp.expect_ok(public.enqueue_cheer(bo, 'yesterday', run, current_date - 1), 'another day');
  perform pg_temp.as_user(cy);
  perform pg_temp.expect_ok(public.enqueue_cheer(bo, 'from Cy', run, current_date), 'another sender');
  if pg_temp.cheers_to(bo) is distinct from 4 then
    raise exception 'per habit: expected 4 rows, got %', pg_temp.cheers_to(bo);
  end if;
end $$;

-- 7. One day cheer per buddy per day from each sender, separate from habit
--    cheers: neither uses the other up.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        cy uuid := pg_temp.mk_user('Cy'); run uuid;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo); perform pg_temp.join(g, cy);
  run := pg_temp.mk_goal(bo, g, 'Run');
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_ok(public.enqueue_cheer(bo, 'day', null, current_date), 'first day cheer');
  perform pg_temp.expect_ok(public.enqueue_cheer(bo, 'habit', run, current_date), 'habit after a day cheer');
  perform pg_temp.age_cheers(ada);
  perform pg_temp.expect_fail(public.enqueue_cheer(bo, 'again', null, current_date),
    'You''ve already cheered Bo''s day', 'same day');
  perform pg_temp.expect_ok(public.enqueue_cheer(cy, 'day', null, current_date), 'another buddy');
end $$;

-- 8. A double tap inside the same minute succeeds without a second row, and
--    without an id, so the Edge Function pushes nothing twice.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        run uuid; res json;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  run := pg_temp.mk_goal(bo, g, 'Run');
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_ok(public.enqueue_cheer(bo, 'hi', run, current_date), 'first tap');
  res := public.enqueue_cheer(bo, 'hi', run, current_date);
  if (res->>'success')::boolean is not true or res->>'notification_id' is not null then
    raise exception 'double tap: expected success without an id, got %', res;
  end if;
  if pg_temp.cheers_to(bo) is distinct from 1 then
    raise exception 'double tap: expected one row, got %', pg_temp.cheers_to(bo);
  end if;
end $$;

-- 9. The day is the one the cheer is about (the push's, or the phone's
--    today). Within a day of the server's date either side, like a check-in;
--    left out, it is the server's today.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
        run uuid; n public.notifications;
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  run := pg_temp.mk_goal(bo, g, 'Run');
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_fail(public.enqueue_cheer(bo, 'hi', run, current_date - 2),
    'It''s too late to cheer that day', 'two days back');
  perform pg_temp.expect_fail(public.enqueue_cheer(bo, 'hi', null, current_date + 2),
    'It''s too late to cheer that day', 'two days ahead');
  perform pg_temp.expect_ok(public.enqueue_cheer(bo, 'hi', run, current_date + 1), 'tomorrow somewhere');
  n := pg_temp.sent(public.enqueue_cheer(bo, 'hi', null, null), 'no day');
  if n.data->>'day' is distinct from current_date::text then
    raise exception 'no day: expected today, got %', n.data;
  end if;
end $$;

-- 10. Quiet hours don't hold a cheer back: like a nudge, it is a person
--     writing to a person, not something the server decided to say.
do $$
declare g uuid := pg_temp.mk_group(); ada uuid := pg_temp.mk_user('Ada'); bo uuid := pg_temp.mk_user('Bo');
begin
  perform pg_temp.join(g, ada); perform pg_temp.join(g, bo);
  update public.notification_prefs set quiet_start = '00:00', quiet_end = '23:59' where user_id = bo;
  perform pg_temp.as_user(ada);
  perform pg_temp.expect_ok(public.enqueue_cheer(bo, 'hi', null, current_date), 'quiet hours');
end $$;

-- 11. Signed out gets a failure, not an exception.
do $$
declare g uuid := pg_temp.mk_group(); bo uuid := pg_temp.mk_user('Bo');
begin
  perform pg_temp.join(g, bo);
  perform pg_temp.as_user(null);
  perform pg_temp.expect_fail(public.enqueue_cheer(bo, 'hi', null, current_date), 'Not signed in', 'signed out');
end $$;

-- 12. Signed-in users may call it; anon may not.
do $$
begin
  if not has_function_privilege('authenticated', 'public.enqueue_cheer(uuid, text, uuid, date)', 'execute') then
    raise exception 'grants: authenticated cannot execute enqueue_cheer';
  end if;
  if has_function_privilege('anon', 'public.enqueue_cheer(uuid, text, uuid, date)', 'execute') then
    raise exception 'grants: anon can execute enqueue_cheer';
  end if;
end $$;

\echo 'send_cheer: all cases passed'

rollback;
