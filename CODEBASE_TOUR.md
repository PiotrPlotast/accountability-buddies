# Accountability Buddies — Codebase Tour & Improvement Notes

## Context

You asked for a newcomer-friendly explanation of this codebase plus an honest list of what could be improved. This document is a guided tour, not an implementation plan — nothing will be changed unless you follow up with "do it." Claims about duplication and structure were verified by reading the files; anything marked **verify first** still needs a double-check before you act on it.

---

## Part 1 — What this app is

**Accountability Buddies** is a React Native app (Expo) where users join small groups and check off daily habit goals together. If everyone in the group completes at least one goal in a day, the group's streak goes up. There are three pillars:

- **Expo Router** for navigation (file-tree routing under `app/`)
- **Supabase** for auth, database, and an RPC (`get_my_group_stats`)
- **TanStack Query (React Query)** for all server state, with optimistic updates

There is **no backend code in this repo** — the schema and RPCs live in Supabase itself. `types/dashboardTypes.ts` mirrors those shapes.

---

## Part 2 — A guided tour

### 2.1 App startup & auth gate

Flow from cold launch:

1. `app/_layout.tsx:19` wires the provider stack: `QueryClientProvider` → `SupabaseProvider` → `Stack`.
2. `providers/supabase-provider.tsx` creates a single Supabase client (AsyncStorage-backed) and toggles `startAutoRefresh`/`stopAutoRefresh` on app foreground/background.
3. `hooks/useSupabase.ts` subscribes to `onAuthStateChange` and exposes `{ isLoaded, session, supabase, signOut }`.
4. Back in `app/_layout.tsx:47`, the `Stack.Protected guard={!!session}` toggle picks between the `(public)` and `(protected)` route groups. **That is the auth gate — don't navigate across groups manually.**

### 2.2 Routes

- **`app/(public)/`** — `welcome`, `sign-in.tsx`, `sign-up.tsx` (sign-up uses email OTP verification).
- **`app/(protected)/(tabs)/`** — `index.tsx` (Dashboard) and `profile.tsx`. These are **native tabs** via `expo-router/unstable-native-tabs`, not JS tabs.
- **`app/(protected)/join-group.tsx`** — shown when a signed-in user has no group. `useDashboardData` auto-redirects here when `groupStats` is null.

### 2.3 Data layer (the core of the app)

Every server read/write goes through React Query. Query keys have a fixed shape that mutations depend on:

| Hook | Query key | What it does |
| --- | --- | --- |
| `useGroupStats` | `["groupStats", userId]` | Calls RPC `get_my_group_stats` — returns active group, streak, invite code |
| `useGroupMembers` | `["groupMembers", groupId]` | Joins `group_members` + `goals` + today's `logs`; derives `completed_today` |
| `useAddGoal` / `useToggleGoal` / `useEditGoal` / `useDeleteGoal` | (mutations) | All optimistically patch `["groupMembers", groupId]` |

Key derivation trick: `goals` has **no `completed_today` column**. It's computed by joining `logs` filtered to today's date (`new Date().toLocaleDateString("en-CA")` → `YYYY-MM-DD`). The same formatter appears in `useGroupMembers`, `useToggleGoal`, and `useDashboardStatus`.

### 2.4 Composition hooks (what screens actually call)

Screens don't use the raw query/mutation hooks directly. They use three composites:

- `useDashboardData` — fetches stats + members, handles the "no group → redirect" flow.
- `useDashboardActions(activeGroupId)` — exposes `addGoal`, `toggleGoal`, `editGoal`, `deleteGoal`; no-ops when `activeGroupId` is null.
- `useDashboardStatus` — derives "is the user waiting on teammates today?" from the raw data.

This is a nice pattern — the dashboard screen stays thin.

### 2.5 Dashboard UI

`app/components/dashboard/Dashboard.tsx` is the container. It renders:

- `DashboardHeader` — group name, streak badge (🔥/⏳), invite code with copy-to-clipboard
- `MemberTabs` — horizontal member switcher (your own tab is labeled "YOU")
- `AddGoalInput` — only visible on your own tab
- `GoalList` — the habit list with swipe-to-edit / swipe-to-delete and tap-to-complete with haptic feedback
- `EditGoalModal`, `DeleteGoalModal` — confirmation modals

### 2.6 Styling & tooling

- **NativeWind v4** (Tailwind for RN). `global.css` is wired via `metro.config.js`. Tailwind only scans `./app/**` and `./components/**` — classes outside those globs won't generate.
- **React Compiler** and **typed routes** are both enabled in `app.json`.
- **Strict TypeScript**, path alias `@/*` → repo root.
- **Expo dev client required** — plain Expo Go will not work (`npm run ios` / `npm run android`).

---

## Part 3 — What could be done better

Ranked roughly by impact. Quick wins are at the top.

### High impact

**1. The four goal mutation hooks are near-duplicates.** `useAddGoal.tsx`, `useToggleGoal.tsx`, `useEditGoal.tsx`, and `useDeleteGoal.tsx` all repeat the same `onMutate` (cancel → snapshot → patch cache) / `onError` (rollback) / `onSettled` (invalidate) shape. Extracting a `useGoalMutation` helper (or even just a `snapshotAndPatchGroupMembers` util) would remove ~150 lines and guarantee they stay in sync. Today, if one hook forgets to invalidate `groupStats`, nobody notices until a streak goes stale.

**2. Query keys are strings scattered across 6+ files.** `["groupStats", userId]` and `["groupMembers", groupId]` are typed as literals in every hook. A single `queryKeys.ts` factory (`queryKeys.groupMembers(groupId)`) prevents silent typos — a misspelled key doesn't error, it just quietly misses the cache.

**3. Today's-date formatter is duplicated in three places.** `new Date().toLocaleDateString("en-CA")` appears in `useGroupMembers`, `useToggleGoal`, and `useDashboardStatus`. A `utils/date.ts` with `getTodayLocalDate()` would centralize the "en-CA trick" (which isn't self-documenting) and make timezone behavior explicit.

### Medium impact

**4. `useEditGoal` doesn't snapshot for rollback.** The other three mutations snapshot `previousMembers` in `onMutate` so they can roll back on error. `useEditGoal` only invalidates on error, which means a failed edit shows the wrong title until the server responds. **Verify first** — check `hooks/useEditGoal.tsx` to confirm.

**5. RPC responses are cast, not validated.** `useGroupStats` casts the RPC result to `GroupResult` without runtime checks. If the Supabase schema drifts, the app will quietly use wrong data. A tiny Zod schema at the boundary would catch this early.

**6. No typecheck script, no CI.** `package.json` has `start`, `ios`, `android`, and `lint` but no `typecheck`. There's no `.github/workflows/` either. Adding `"typecheck": "tsc --noEmit"` and a GitHub Actions workflow that runs lint + typecheck on PR would catch regressions that `expo lint` misses.

**7. No `.env.example`.** `.env` is correctly gitignored (good!), but there's no example file, so a new contributor has to read `providers/supabase-provider.tsx` to discover which vars to set.

### Lower impact / polish

**8. Environment variables are non-null asserted.** `providers/supabase-provider.tsx` uses `process.env.EXPO_PUBLIC_SUPABASE_URL!`. If the env var is missing, the app crashes deep in Supabase internals with a confusing error. A loud check at startup is friendlier.

**9. `console.log` / `console.error` scattered in auth and fetch paths.** Fine during development, but production builds will ship them. A thin `log()` wrapper gated on `__DEV__` (or Sentry for errors) is the standard fix.

**10. `Alert.alert` shows raw error messages.** Users see Supabase/Postgres error strings on failure. A small `humanizeError(err)` helper would turn `duplicate key value violates unique constraint "goals_pkey"` into "This habit already exists."

**11. `GoalList.tsx` is doing a lot.** It handles layout, swipe gestures, toggle animation, and skeleton/empty states in one file. Splitting out `GoalItem` and `GoalSkeleton` would make each piece easier to read and test.

**12. No tests.** CLAUDE.md calls this out directly. For a small app it's defensible, but the optimistic-update logic in the mutation hooks is exactly the kind of thing where a handful of React Query tests would pay for themselves — especially after fixing #1 above.

---

## What's genuinely good

So you know what to keep:

- The composition-hook pattern (`useDashboardData` / `useDashboardActions` / `useDashboardStatus`) is clean. Screens stay thin.
- The auth gate via `Stack.Protected` is the right Expo Router pattern — simpler than a manual redirect effect.
- The provider wires `AppState` to pause/resume Supabase's token refresh. Easy to miss, and skipping it causes weird stale-auth bugs.
- Strict TS, path aliases, React Compiler, typed routes — the tooling bar is already set high.

---

## Verification

This is a read-only tour — there's nothing to run. If you want to act on any of the Part 3 items, confirm the specific one and I'll follow up with a focused implementation plan (with the actual diff scope, not this high-level list).
