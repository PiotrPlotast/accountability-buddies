-- The Data API grants on every public table (2026-10-20,
-- 20261020120000_explicit_table_grants.sql). From 2026-10-30 Supabase grants
-- nothing on a table created in `public`, so a schema rebuilt from the
-- migrations has exactly the grants they write. This pins them:
--
--   * anon may touch no table.
--   * authenticated may run the commands it has a policy for, with the column
--     grants on `groups`, `group_members` and `notifications`, and never
--     TRUNCATE, REFERENCES or TRIGGER.
--   * service_role may select, insert, update and delete everywhere.
--   * Every public table is on the list below and has RLS on, so a new table
--     fails here until its grants are decided.
--   * A table created later gets nothing by default.
--
-- Run against a database with every migration applied (e.g. `supabase start`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/table_grants.sql
-- Each case raises on failure; everything runs in one transaction that is
-- rolled back, so nothing is left behind.

begin;

-- table, role, table-level commands, column grants beyond them
create temp table expected (tbl text, role text, cmds text, cols text);
insert into expected values
  ('device_push_tokens',     'authenticated', 'DELETE,SELECT',               ''),
  ('goals',                  'authenticated', 'DELETE,INSERT,SELECT,UPDATE', ''),
  ('group_members',          'authenticated', 'DELETE,SELECT',               'group_id:INSERT,user_id:INSERT'),
  ('groups',                 'authenticated', 'SELECT',                      'creator_id:INSERT,icon:INSERT,icon:UPDATE,name:INSERT,name:UPDATE'),
  ('logs',                   'authenticated', 'DELETE,INSERT,SELECT',        ''),
  ('notification_prefs',     'authenticated', 'SELECT,UPDATE',               ''),
  ('notifications',          'authenticated', 'SELECT',                      'read_at:UPDATE'),
  ('profiles',               'authenticated', 'SELECT,UPDATE',               ''),
  ('push_tickets',           'authenticated', '',                            ''),
  ('social_announced_ticks', 'authenticated', '',                            '');
insert into expected
  select tbl, 'anon', '', '' from expected where role = 'authenticated';
insert into expected
  select tbl, 'service_role', 'DELETE,INSERT,SELECT,UPDATE', '' from expected where role = 'authenticated';

create temp view actual as
select c.relname as tbl, r.rolname as role,
  coalesce((select string_agg(p, ',' order by p)
     from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     where has_table_privilege(r.oid, c.oid, p)), '') as cmds,
  coalesce((select string_agg(a.attname || ':' || p, ',' order by a.attname, p)
     from pg_attribute a, unnest(array['SELECT','INSERT','UPDATE']) p
     where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       and has_column_privilege(r.oid, c.oid, a.attnum, p)
       and not has_table_privilege(r.oid, c.oid, p)), '') as cols
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
cross join pg_roles r
where c.relkind in ('r', 'p', 'v', 'm', 'f')
  and r.rolname in ('anon', 'authenticated', 'service_role');


-- 1. Every grant is the one listed, and every public table is listed.
do $$
declare d record;
begin
  for d in
    (select * from actual except select * from expected)
    union all
    (select * from expected except select * from actual)
  loop
    raise exception 'case 1: % for % is "%" / "%", which differs from the list (a new table needs its grants here and in its migration)',
      d.tbl, d.role, d.cmds, d.cols;
  end loop;
end $$;


-- 2. Every public table has RLS on, since the grants above lean on it.
do $$
declare t text;
begin
  select string_agg(relname, ', ') into t
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if t is not null then
    raise exception 'case 2: RLS is off on %', t;
  end if;
end $$;


-- 3. A table created now is out of the API's reach until it is granted,
-- the way every table is after 2026-10-30.
create table public.grants_probe (id int);
do $$
begin
  if has_table_privilege('anon', 'public.grants_probe', 'SELECT')
     or has_table_privilege('authenticated', 'public.grants_probe', 'SELECT')
     or has_table_privilege('service_role', 'public.grants_probe', 'SELECT') then
    raise exception 'case 3: a new table was granted to the API roles by default';
  end if;
end $$;
drop table public.grants_probe;


-- 4. The app's own writes still go through as authenticated.
do $$
declare
  me    uuid := gen_random_uuid();
  grp   uuid;
  goal  uuid;
  note  uuid;
  err   text;
begin
  insert into auth.users (id) values (me);
  insert into public.profiles (id, full_name) values (me, 'Ada')
    on conflict (id) do update set full_name = excluded.full_name;
  insert into public.notifications (recipient_id, type, title, body, dedupe_key)
    values (me, 'nudge', 't', 'b', 'grants:' || me) returning id into note;
  insert into public.device_push_tokens (user_id, expo_push_token)
    values (me, 'ExponentPushToken[grants]');

  perform set_config('request.jwt.claim.sub', me::text, true);
  set local role authenticated;
  begin
    -- join-group.tsx: create the group, then join it.
    insert into public.groups (name, creator_id) values ('Crew', me) returning id into grp;
    insert into public.group_members (group_id, user_id) values (grp, me);
    update public.groups set name = 'Crew 2', icon = '🔥' where id = grp;
    -- useAddGoal / useEditGoal / useToggleGoal / useDeleteGoal
    insert into public.goals (user_id, group_id, title) values (me, grp, 'Run') returning id into goal;
    update public.goals set title = 'Run far' where id = goal;
    insert into public.logs (goal_id, user_id, date) values (goal, me, current_date);
    delete from public.logs where goal_id = goal;
    delete from public.goals where id = goal;
    -- useUpdateProfile / useTour, useNotificationPrefs / usePushRegistration
    update public.profiles set full_name = 'Ada L', tour_seen_at = now() where id = me;
    update public.notification_prefs set timezone = 'Europe/Warsaw' where user_id = me;
    -- useNotificationTaps, sign-out
    update public.notifications set read_at = now() where id = note;
    perform 1 from public.device_push_tokens where user_id = me;
    delete from public.device_push_tokens where expo_push_token = 'ExponentPushToken[grants]';
  exception when others then
    err := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  if err is not null then
    raise exception 'case 4: an app write failed as authenticated: %', err;
  end if;
end $$;


-- 5. The Edge Functions' reads and writes go through as service_role.
do $$
declare
  me  uuid := gen_random_uuid();
  err text;
begin
  insert into auth.users (id) values (me);
  insert into public.device_push_tokens (user_id, expo_push_token)
    values (me, 'ExponentPushToken[service]');

  set local role service_role;
  begin
    perform expo_push_token from public.device_push_tokens where user_id = me;
    perform 1 from public.notifications where recipient_id = me;
    delete from public.device_push_tokens where expo_push_token = 'ExponentPushToken[service]';
  exception when others then
    err := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  if err is not null then
    raise exception 'case 5: a service_role read failed: %', err;
  end if;
end $$;

do $$ begin raise notice 'table_grants: all cases passed'; end $$;

rollback;
