# Accountability Buddies

A mobile app for shared habit tracking. Form a duo / small group, set daily goals, log them as you complete them, and watch your streaks (and your buddies') in real time.

Built with Expo (React Native) and Supabase.

## Stack

- **Expo SDK 54** + **React Native 0.81** with the new architecture and React Compiler enabled
- **expo-router** for filesystem routing with typed routes and `Stack.Protected` auth gating
- **Supabase** (Auth + Postgres + RPCs) for the backend
- **TanStack Query** for server state with optimistic mutations
- **NativeWind v4** (Tailwind) for styling
- **TypeScript** in `strict` mode
- **Jest** + `@testing-library/react-native` for tests

## Getting started

### Prerequisites

- Node 20+ and npm
- Xcode (iOS) and/or Android Studio (Android) — Expo Go is **not** supported because the project depends on `expo-dev-client`
- A Supabase project with the schema described under [Backend](#backend)

### Install

```bash
npm install
```

### Configure environment

Create a `.env` file at the repo root:

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=<your-anon-key>
```

Expo inlines `EXPO_PUBLIC_*` variables at build time, so you must rebuild the dev client after changing them.

### Run

```bash
npm start            # Metro / Expo dev server
npm run ios          # build & launch the iOS dev client
npm run android      # build & launch the Android dev client
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server (Metro) |
| `npm run ios` | Build and run the iOS dev client |
| `npm run android` | Build and run the Android dev client |
| `npm run lint` | `expo lint . --fix` (ESLint + Prettier) |
| `npm test` | Run the Jest suite |
| `npm run test:watch` | Jest in watch mode |
| `npx tsc --noEmit` | Type-check (no script alias) |

## Project layout

```
app/                       expo-router file tree
  _layout.tsx              QueryClientProvider → SupabaseProvider → Stack.Protected guard
  (public)/                welcome, sign-in, sign-up
  (protected)/
    (tabs)/                native tabs — dashboard (index) + profile
    join-group.tsx         fallback when the user has no group
    new-habit.tsx          create-goal screen
  components/              dashboard + profile UI
hooks/                     query/mutation hooks + composition hooks
providers/                 Supabase client provider
types/                     row types mirroring the Supabase schema
supabase/migrations/       SQL migrations for the backing tables/RPCs
__tests__/                 Jest tests
```

## Architecture

### Auth gate

`app/_layout.tsx` wraps the tree in `QueryClientProvider` → `SupabaseProvider` → `Stack`, then uses `Stack.Protected guard={!!session}` to swap between the `(protected)` and `(public)` route groups based on the Supabase session. Don't navigate directly between groups — flip the session and let the guard redirect.

### Supabase client

`providers/supabase-provider.tsx` creates a single memoized client (with `AsyncStorage`, `processLock`, and `autoRefreshToken`) and wires an `AppState` listener for `startAutoRefresh` / `stopAutoRefresh` on foreground/background. `hooks/useSupabase.ts` is the only sanctioned consumer and exposes `{ isLoaded, session, supabase, signOut }`.

### Server state

All server data flows through TanStack Query. Two query keys drive the dashboard:

- `["groupStats", userId]` — `useGroupStats` (calls the `get_my_group_stats` RPC)
- `["groupMembers", groupId]` — `useGroupMembers` (joins `group_members` + `goals` + today's `logs`)

Mutation hooks (`useAddGoal`, `useToggleGoal`, `useEditGoal`, `useDeleteGoal`) all share the same optimistic-update shape: `onMutate` cancels and snapshots, patches the `["groupMembers", groupId]` cache, and returns the snapshot; `onError` rolls back; `onSettled` invalidates. New mutations should match this shape so the cache and server stay in sync.

"Completed today" is **derived**, not stored: `useGroupMembers` joins `logs` filtered by `date = today` and sets `completed_today = logs.length > 0`. Today is computed as `new Date().toLocaleDateString("en-CA")` (`YYYY-MM-DD`) — use the same formatter wherever you compare against `logs.date` or `last_streak_date`.

### Composition hooks

Screens consume `useDashboardData`, `useDashboardActions`, and `useDashboardStatus` rather than wiring the raw query/mutation hooks directly. `useDashboardActions` no-ops when `activeGroupId` is null, so callers don't need to guard.

## Backend

The app expects the following to exist in Supabase:

- **Tables:** `groups`, `group_members`, `goals`, `logs`, `profiles`
- **RPCs:** `get_my_group_stats`, `join_group_via_code`

`types/dashboardTypes.ts` mirrors these shapes — keep it in sync when the schema changes. Note that nested row types (e.g. `GoalRow.logs`, `GroupMemberRow.profiles`) reflect Supabase's `select("...foo(...)")` nesting, not the actual column layout.

SQL migrations live under `supabase/migrations/`.

## Conventions

- Path alias `@/*` maps to the repo root. Prefer `@/hooks/...`, `@/types/...`, `@/providers/...` over relative imports.
- TypeScript `strict` and `noImplicitAny` are on.
- User-facing errors use `Alert.alert` (see the mutation hooks' `onError` handlers).
- NativeWind/Tailwind only scans `./app/**` and `./components/**` — classes in files outside those globs won't be generated.
