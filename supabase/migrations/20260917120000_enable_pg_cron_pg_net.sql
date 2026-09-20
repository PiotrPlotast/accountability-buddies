-- E3 — push infrastructure, Phase 0 of todo/push-notifications.md: the two
-- extensions the scheduled jobs need.
--
-- pg_cron runs the jobs (Phase 7's receipt check, E5's reminder enqueue) and
-- pg_net lets those jobs call the dispatcher Edge Function over HTTP. Nothing
-- is scheduled here; the first job arrives in its own migration.
--
-- pg_net was dropped at the end of the pulled initial schema, so this is the
-- migration that brings it back — migrations replay in order.
--
-- Schemas follow Supabase's own guidance: pg_cron in pg_catalog, pg_net in
-- extensions (it still creates and owns its `net` schema).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
