-- #2 from RLS audit: profiles was world-readable via the "Public profiles" policy
-- (USING (true)), exposing every user's full_name / nickname / avatar_url to any
-- caller. Scope SELECT to authenticated users, limited to themselves and users who
-- share at least one group with them.
DROP POLICY IF EXISTS "Public profiles" ON public.profiles;

CREATE POLICY "Profiles visible to group mates" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR id IN (
      SELECT gm.user_id
      FROM public.group_members gm
      WHERE gm.group_id IN (
        SELECT gm2.group_id
        FROM public.group_members gm2
        WHERE gm2.user_id = (SELECT auth.uid())
      )
    )
  );
