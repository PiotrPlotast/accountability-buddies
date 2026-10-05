-- Indexes for the lookups every screen makes, and `auth.uid()` evaluated once
-- per query in the policies that still evaluated it per row (2026-10-05).
--
-- Nothing here changes who can read or write what. Both halves come from
-- Supabase's performance advisor (`unindexed_foreign_keys`,
-- `auth_rls_initplan`), and at today's size neither is measurable — every
-- table fits in one page, so the planner rightly keeps scanning. `logs` is the
-- one that grows without bound, one row per habit per person per day, and
-- every dashboard load and toggle runs these policies over it.

-- ---------------------------------------------------------------------------
-- Indexes. Postgres indexes a primary key and a unique constraint on its own,
-- never the referencing side of a foreign key.
-- ---------------------------------------------------------------------------

-- `useGroupMembers`: a group's goals.
create index if not exists goals_group_id_idx on public.goals (group_id);

-- Owner checks in the goal policies, `check_daily_streak`, `delete_my_account`.
create index if not exists goals_user_id_idx on public.goals (user_id);

-- "Which groups am I in?" — `get_my_group_stats` and the innermost subquery of
-- every group-scoped policy. `unique (group_id, user_id)` cannot serve it: an
-- index is only searchable from its leading column.
create index if not exists group_members_user_id_idx
  on public.group_members (user_id);

-- "See my groups" and `delete_my_account`.
create index if not exists groups_creator_id_idx on public.groups (creator_id);

-- `get_heatmap_logs` reads one person's (date) pairs and counts them, which
-- this index answers on its own without visiting the table. It also covers
-- the `logs.user_id` foreign key and the group-scoped logs policy.
-- `logs.goal_id` needs nothing new: `logs_one_per_goal_per_day` leads with it.
create index if not exists logs_user_id_date_idx on public.logs (user_id, date);

-- ---------------------------------------------------------------------------
-- Policies. Written bare, `auth.uid()` may be called once for every row a
-- policy checks; wrapped as `(select auth.uid())` the planner runs it once per
-- statement and reuses the result. Same value either way.
--
-- `alter policy` changes only the expressions: name, command, roles and
-- permissiveness stay as they are. Each expression below is the live one with
-- that wrapping and nothing else changed.
-- ---------------------------------------------------------------------------

alter policy "See group goals" on public.goals
  using (
    user_id = (select auth.uid())
    or user_id in (
      select group_members.user_id
        from public.group_members
       where group_members.group_id in (
         select group_members_1.group_id
           from public.group_members group_members_1
          where group_members_1.user_id = (select auth.uid())
       )
    )
  );

alter policy "See group logs" on public.logs
  using (
    user_id = (select auth.uid())
    or user_id in (
      select group_members.user_id
        from public.group_members
       where group_members.group_id in (
         select group_members_1.group_id
           from public.group_members group_members_1
          where group_members_1.user_id = (select auth.uid())
       )
    )
  );

alter policy "Users can delete their own logs" on public.logs
  using ((select auth.uid()) = user_id);

alter policy "See my groups" on public.groups
  using (public.is_group_member(id) or creator_id = (select auth.uid()));

alter policy "Create groups" on public.groups
  with check ((select auth.uid()) = creator_id);

alter policy "Join groups" on public.group_members
  with check ((select auth.uid()) = user_id);

-- No WITH CHECK, as before: an UPDATE policy without one applies its USING
-- expression to the new row too.
alter policy "Users update own profile" on public.profiles
  using ((select auth.uid()) = id);
