-- E3 — push infrastructure, Phase 2 of todo/push-notifications.md: the schema.
--
-- Four objects: `device_push_tokens`, `notification_prefs`, `notifications`
-- and `goals.reminder_time`. Nothing here sends anything yet — the Edge
-- Functions (E4), the dispatcher and the cron jobs (E5) build on top. pg_cron
-- and pg_net are deliberately not enabled here; they arrive with the first job
-- that uses them.
--
-- Account deletion: unlike the E1/E2 tables, everything below that points at
-- `auth.users` says what happens on delete, so `delete_my_account()` needs no
-- change. Its final `delete from auth.users` cascades away the user's tokens,
-- prefs and received notifications, and nulls `sender_id` on notifications
-- they sent — a buddy's history survives, and the sender's name was already
-- rendered into `title`/`body` at send time.


-- ---------------------------------------------------------------------------
-- device_push_tokens — one row per device, not a column on `profiles`, which
-- would silently lose a token the moment someone signs in on a second phone.
-- ---------------------------------------------------------------------------

create table public.device_push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- Unique: a token identifies an app install, not a person. A phone that
  -- switches accounts moves its row to the new user (see register_push_token).
  expo_push_token text not null unique,
  device_id       text,
  platform        text check (platform in ('ios', 'android')),
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create index device_push_tokens_user_id_idx on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

-- Read and delete only. Delete is the sign-out path: the client removes this
-- device's row *before* `auth.signOut()`, while it still has a JWT.
--
-- There is deliberately no INSERT or UPDATE policy. The account-switch case
-- needs to overwrite a row that still belongs to the previous user, which no
-- RLS policy keyed on `auth.uid()` can allow without also letting anyone steal
-- any token. Writes go through register_push_token() instead.
create policy "Read own push tokens" on public.device_push_tokens
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Delete own push tokens" on public.device_push_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.device_push_tokens from anon;
revoke insert, update, truncate, references, trigger
  on table public.device_push_tokens from authenticated;


-- register_push_token — the only client write path for tokens.
--
-- SECURITY DEFINER so the upsert can take over a row owned by another account.
-- That is safe because the caller has to *present* the token, and a token is
-- only obtainable from the device it was issued to. The owner is always
-- `auth.uid()`, never an argument.
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

  insert into public.device_push_tokens (user_id, expo_push_token, device_id, platform)
  values (my_id, p_token, p_device_id, p_platform)
  on conflict (expo_push_token) do update
    set user_id      = excluded.user_id,
        device_id    = excluded.device_id,
        platform     = excluded.platform,
        last_seen_at = now();
end;
$function$;

-- Same pattern as 20260826174500_security_fixes_execute_grants.sql: EXECUTE is
-- granted to PUBLIC by default and anon inherits it.
revoke execute on function public.register_push_token(text, text, text) from public, anon;
grant  execute on function public.register_push_token(text, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- notification_prefs — per account, unlike the accent colour and the haptics
-- switch, which are per device. One row per user, always present.
-- ---------------------------------------------------------------------------

create table public.notification_prefs (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  -- IANA name written by the client (`Intl.DateTimeFormat().resolvedOptions()`).
  -- The check rejects a name Postgres can't resolve: the reminder cron evaluates
  -- `now() at time zone timezone` across every row, so one bad value would
  -- throw for everyone rather than just for its owner.
  timezone          text not null default 'UTC'
                    check ((now() at time zone timezone) is not null),
  reminders_enabled boolean not null default true,
  nudges_enabled    boolean not null default true,
  social_enabled    boolean not null default true,
  -- Local wall-clock times in `timezone`. Both or neither. The window may wrap
  -- midnight (22:00–07:00 means quiet_start > quiet_end), so the E5 check must
  -- not be a plain BETWEEN. Equal start and end would be an empty or a 24h
  -- window depending on who reads it, so it is rejected.
  quiet_start       time,
  quiet_end         time,
  updated_at        timestamptz not null default now(),
  constraint notification_prefs_quiet_hours_pair
    check ((quiet_start is null) = (quiet_end is null)),
  constraint notification_prefs_quiet_hours_nonempty
    check (quiet_start is null or quiet_start <> quiet_end)
);

alter table public.notification_prefs enable row level security;

-- Read and update only. The row is created by the trigger below and removed by
-- the cascade from auth.users, so the client has no business inserting or
-- deleting one — the same shape as `profiles`.
create policy "Read own notification prefs" on public.notification_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Update own notification prefs" on public.notification_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.notification_prefs from anon;
revoke insert, delete, truncate, references, trigger
  on table public.notification_prefs from authenticated;


-- A separate trigger rather than a second insert inside handle_new_user(): that
-- function belongs to profiles and is still the dashboard-era original.
create or replace function public.handle_new_user_notification_prefs()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
begin
  insert into public.notification_prefs (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

-- A trigger function needs no EXECUTE grant to fire, and has no business on
-- the REST surface.
revoke execute on function public.handle_new_user_notification_prefs()
  from public, anon, authenticated;

create trigger on_auth_user_created_notification_prefs
  after insert on auth.users
  for each row execute function public.handle_new_user_notification_prefs();

-- Accounts that predate the trigger.
insert into public.notification_prefs (user_id)
select id from auth.users
on conflict (user_id) do nothing;


-- ---------------------------------------------------------------------------
-- notifications — outbox, delivery log and future in-app inbox in one table.
-- ---------------------------------------------------------------------------

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  -- Null means a system notification (reminders), or a sender whose account
  -- has since been deleted.
  sender_id    uuid references auth.users (id) on delete set null,
  -- SET NULL, not NO ACTION: delete_my_account() drops a group when its last
  -- member leaves, and a notification must not block that.
  group_id     uuid references public.groups (id) on delete set null,
  type         text not null
               check (type in ('nudge', 'reminder', 'buddy_done', 'member_joined')),
  title        text not null,
  body         text not null,
  data         jsonb not null default '{}'::jsonb,
  -- The whole idempotency story: 'reminder:<goal_id>:<local_date>',
  -- 'nudge:<sender>:<recipient>:<epoch_minute>' and so on. A cron job that
  -- fires twice or a retried Edge Function hits this constraint instead of
  -- sending twice, so every insert path has to choose a key — hence NOT NULL.
  dedupe_key   text not null unique,
  status       text not null default 'pending'
               check (status in ('pending', 'sent', 'failed')),
  ticket_id    text,
  error        text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  read_at      timestamptz
);

-- The dispatcher drain. Partial, so it stays the size of the backlog rather
-- than the size of the history.
create index notifications_pending_idx on public.notifications (created_at)
  where status = 'pending';

-- The inbox, and the recipient FK.
create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

-- The nudge rate limits (per sender per day), and the sender FK's SET NULL.
create index notifications_sender_created_idx
  on public.notifications (sender_id, created_at)
  where sender_id is not null;

-- The group FK's SET NULL when a group is dropped.
create index notifications_group_id_idx
  on public.notifications (group_id)
  where group_id is not null;

alter table public.notifications enable row level security;

create policy "Read own notifications" on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy "Mark own notifications read" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- No client insert path at all: rows come from SECURITY DEFINER functions and
-- the service role. And the update policy above is row-level only, so the
-- column grant is what narrows it to `read_at` — without it a recipient could
-- rewrite `status` or `body` on their own rows.
revoke all on table public.notifications from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.notifications from authenticated;
grant update (read_at) on table public.notifications to authenticated;


-- ---------------------------------------------------------------------------
-- goals.reminder_time — null means "no reminder".
-- ---------------------------------------------------------------------------

-- A local wall-clock time in the owner's `notification_prefs.timezone`.
--
-- When E5 checks whether a reminder is due today, `goals.repeat_days` is
-- Monday = 0 … Sunday = 6 (the convention lib/repeatDays.ts owns on the
-- client). In SQL that is `extract(isodow from local_now)::int - 1` — not
-- `extract(dow ...)`, which is Sunday = 0. An empty array means every day.
alter table public.goals add column reminder_time time;
