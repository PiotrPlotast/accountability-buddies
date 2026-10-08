-- Icon length (2026-10-08): the client lets people pick any emoji, so the
-- database is now the only thing keeping `goals.icon` and `groups.icon` to
-- something an emoji tile can show. The cap is 16 code points: the longest
-- RGI emoji (ZWJ families, skin-toned couples, tag-sequence flags) fit with
-- room to spare, a sentence does not.
--
-- Run against a database with every migration applied:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/icon_length.sql
-- Each case raises on failure; everything is rolled back.

begin;

create function pg_temp.expect_rejected(p_sql text, p_label text)
  returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: % was accepted', p_label;
exception when check_violation then
  null;
end $$;

do $$
declare
  _user uuid := gen_random_uuid();
  _group uuid;
begin
  insert into auth.users (id) values (_user);
  insert into public.profiles (id, full_name) values (_user, 'test')
    on conflict (id) do nothing;

  -- Long single emoji are accepted.
  insert into public.groups (name, icon) values ('g', '👨‍👩‍👧‍👦') returning id into _group;
  insert into public.goals (user_id, group_id, title, icon)
    values (_user, _group, 'a', '🧑🏽‍🤝‍🧑🏿');
  insert into public.goals (user_id, group_id, title, icon)
    values (_user, _group, 'b', '🏴󠁧󠁢󠁳󠁣󠁴󠁿');
  -- A habit may still have no icon.
  insert into public.goals (user_id, group_id, title, icon)
    values (_user, _group, 'c', null);

  perform pg_temp.expect_rejected(format(
    $q$insert into public.goals (user_id, group_id, title, icon)
       values (%L, %L, 'd', repeat('x', 17))$q$, _user, _group),
    'a 17-character goal icon');
  perform pg_temp.expect_rejected(format(
    $q$update public.groups set icon = repeat('🔥', 17) where id = %L$q$, _group),
    'a 17-emoji group icon');

  raise notice 'icon_length: all cases passed';
end $$;

rollback;
