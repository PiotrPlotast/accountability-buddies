-- E2 PR 1 — one name column.
--
-- `profiles` carried two display names, `full_name` and `nickname`, with no
-- rule about which won. Buddies saw `full_name` (useGroupMembers), you saw
-- `nickname` (Profile), nothing synced them, and the values genuinely differed
-- for both live accounts.
--
-- `full_name` survives: the signup trigger `handle_new_user` already writes it,
-- every identity provider hands over that key, and `useGroupMembers`,
-- `MemberTabs` and `types/dashboardTypes.ts` already read it.
--
-- The values in `nickname` are discarded. This is irreversible — take a backup
-- first if the two nicknames are worth keeping.

alter table "public"."profiles"
  drop column if exists "nickname";
