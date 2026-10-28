-- Explicit Data API grants on every public table (2026-10-20).
--
-- From 2026-10-30 Supabase stops granting anon/authenticated/service_role
-- anything on a new table in `public`, and that includes a schema rebuilt from
-- these migrations: `supabase db reset`, preview branches and fresh projects.
-- The five tables in the initial dump carry their own `GRANT ALL`, but the
-- nine added since leaned on the platform's default privileges, so a rebuild
-- would leave the push-token, prefs and notification tables unreadable by the
-- app and by the Edge Functions' service role.
--
-- This migration states the whole grant table instead of inheriting it, and
-- the live project ends up where a rebuild does. RLS is still the real gate;
-- the grants only say which commands may reach a policy at all. Alongside it:
--
--   * anon gets nothing. Every policy is `to authenticated` or keyed on
--     `auth.uid()`, which is null for anon, and the signed-out screens never
--     read a table, so anon's ALL on the original five reached no rows.
--   * authenticated gets the commands it has a policy for and nothing else
--     (no TRUNCATE, which skips RLS, no REFERENCES or TRIGGER). The column
--     grants from 20260916120000 and 20261017120000 are restated as they were.
--   * service_role gets select/insert/update/delete on every table.
--   * The default privileges from the initial dump are revoked, so a table
--     created later is reachable only through the grants written beside it,
--     on the live project and on a rebuild alike.
--
-- A new table goes on this list: put its grants in the migration that creates
-- it (see CLAUDE.md, "Backend contract").

revoke all on table
  public.goals,
  public.group_members,
  public.groups,
  public.logs,
  public.profiles,
  public.device_push_tokens,
  public.notification_prefs,
  public.notifications,
  public.push_tickets,
  public.social_announced_ticks
from anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- authenticated: one line per policy command.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on table public.goals to authenticated;

grant select, delete                 on table public.group_members to authenticated;
grant insert (group_id, user_id)     on table public.group_members to authenticated;

grant select                         on table public.groups to authenticated;
grant insert (name, icon, creator_id) on table public.groups to authenticated;
grant update (name, icon)            on table public.groups to authenticated;

grant select, insert, delete         on table public.logs to authenticated;

grant select, update                 on table public.profiles to authenticated;

-- Writes go through register_push_token(); sign-out deletes by token.
grant select, delete                 on table public.device_push_tokens to authenticated;

-- The row is made by a trigger on auth.users; the client only updates it.
grant select, update                 on table public.notification_prefs to authenticated;

grant select                         on table public.notifications to authenticated;
grant update (read_at)               on table public.notifications to authenticated;

-- push_tickets and social_announced_ticks are server-only.


-- ---------------------------------------------------------------------------
-- service_role: the Edge Functions (send-nudge, send-cheer,
-- dispatch-notifications, check-receipts).
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on table
  public.goals,
  public.group_members,
  public.groups,
  public.logs,
  public.profiles,
  public.device_push_tokens,
  public.notification_prefs,
  public.notifications,
  public.push_tickets,
  public.social_announced_ticks
to service_role;


-- ---------------------------------------------------------------------------
-- No more implicit grants on future tables.
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
