-- Follow-up to 20260826173000_security_fixes_rls_audit.sql
--
-- Postgres grants EXECUTE to PUBLIC by default, and anon/authenticated inherit from
-- PUBLIC, so a REVOKE targeting only anon/authenticated leaves the privilege intact.
-- Revoke from PUBLIC (which removes the anon-callable REST surface), then re-grant
-- EXECUTE to authenticated only where the app or RLS actually needs it.

-- Trigger functions: never called as RPCs. Revoke from PUBLIC, grant nothing back.
-- (Trigger firing bypasses EXECUTE privilege checks, so this does not affect triggers.)
REVOKE EXECUTE ON FUNCTION public.handle_new_user()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_daily_streak() FROM PUBLIC, anon, authenticated;

-- RLS helper: invoked by the group_members / groups SELECT policies, so the
-- authenticated role must retain EXECUTE. anon does not need it.
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_group_member(uuid) TO authenticated;

-- App RPCs: called by signed-in users. Keep authenticated, drop anon.
REVOKE EXECUTE ON FUNCTION public.get_my_group_stats()          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_group_stats()          TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_group_via_code(text)     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_group_via_code(text)     TO authenticated;

-- Heatmap (now SECURITY INVOKER): called by signed-in users. Drop anon.
REVOKE EXECUTE ON FUNCTION public.get_heatmap_logs(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_heatmap_logs(uuid) TO authenticated;
