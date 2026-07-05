# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — start the Expo dev server (Metro)
- `npm run ios` / `npm run android` — build and run native dev clients (requires `expo-dev-client`; regular Expo Go will not work)
- `npm run lint` — run `expo lint . --fix` (ESLint + Prettier, `eslint-config-expo` flat config)

There is no test runner configured. There is no build/typecheck script — run `npx tsc --noEmit` directly if you need a type check.

## Environment

Supabase credentials are read from `process.env.EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` in `providers/supabase-provider.tsx` and must be defined in `.env` (Expo inlines `EXPO_PUBLIC_*` vars at build time).

## Architecture

### Routing & auth gate

`app/` is an [expo-router](https://expo.github.io/router) file-tree. Typed routes and the React Compiler are both enabled (`app.json > expo.experiments`). The auth split lives in `app/_layout.tsx`, which wraps the tree in `QueryClientProvider` → `SupabaseProvider` → `Stack` and uses `Stack.Protected guard={!!session}` to swap between the `(protected)` and `(public)` route groups based on the Supabase session. Never route around this by navigating directly between groups — flip the session and let the guard redirect.

`(protected)/(tabs)` uses `expo-router/unstable-native-tabs` (native iOS/Android tabs, not JS tabs). `(protected)/join-group.tsx` is the fallback when a signed-in user has no group — `useDashboardData` auto-redirects there when `groupStats` returns null.

### Supabase client lifecycle

`providers/supabase-provider.tsx` creates a single memoized client with `AsyncStorage`, `processLock`, and `autoRefreshToken`. It also wires an `AppState` listener to call `startAutoRefresh`/`stopAutoRefresh` on foreground/background — don't duplicate this elsewhere. `hooks/useSupabase.ts` is the only sanctioned consumer: it reads the context, subscribes to `onAuthStateChange`, and exposes `{ isLoaded, session, supabase, signOut }`. It throws if used outside the provider.

### Server state (TanStack Query) pattern

All server data flows through React Query. Query keys follow a fixed shape that mutations depend on:

- `["groupStats", userId]` — `useGroupStats` (calls the `get_my_group_stats` RPC)
- `["groupMembers", groupId]` — `useGroupMembers` (joins `group_members` + `goals` + today's `logs`)

Mutation hooks (`useAddGoal`, `useToggleGoal`, `useEditGoal`, `useDeleteGoal`) all use the same optimistic-update shape: `onMutate` cancels queries, snapshots `previousMembers`, patches the `["groupMembers", groupId]` cache, and returns the snapshot; `onError` rolls back from context; `onSuccess`/`onSettled` invalidates `groupMembers` (and `groupStats` when streak state may have changed). When adding a new mutation, match this shape — breaking it silently desyncs the cache from the server.

"Completed today" is derived: `useGroupMembers` joins `logs` filtered by `date = today` and sets `completed_today = logs.length > 0`. The `goals` table itself has no `completed_today` column. Today's date is computed as `new Date().toLocaleDateString("en-CA")` (yields `YYYY-MM-DD`); use the same formatter anywhere you compare against `logs.date` or `last_streak_date`.

### Composition hooks

`hooks/useDashboardData`, `useDashboardActions`, and `useDashboardStatus` are the consumer-facing hooks the Dashboard screen uses. They compose the raw query/mutation hooks above — screens should call these composite hooks rather than wiring `useGroupStats` + `useGroupMembers` + mutations themselves. `useDashboardActions` takes an `activeGroupId` and no-ops when it's null, so callers don't need to guard.

### Backend coupling

The app depends on Supabase RPCs and table shapes that live in the database, not in this repo: `get_my_group_stats`, `join_group_via_code`, and tables `groups`, `group_members`, `goals`, `logs`, `profiles`. `types/dashboardTypes.ts` mirrors those shapes — keep it in sync when the schema changes. Row types with nested relations (e.g. `GoalRow.logs`, `GroupMemberRow.profiles`) reflect Supabase's `select("...foo(...)")` nesting, not the actual column layout.

### Styling

NativeWind v4 with Tailwind. `global.css` is injected via `metro.config.js` (`withNativeWind`), and `babel.config.js` sets `jsxImportSource: "nativewind"`. Tailwind scans `./app/**` and `./components/**` — classes in files outside those globs won't be generated.

## Conventions

- Path alias `@/*` maps to the repo root (see `tsconfig.json`). Prefer `@/hooks/...`, `@/types/...`, `@/providers/...` over relative paths.
- TypeScript `strict` + `noImplicitAny` are on.
- User-facing errors use `Alert.alert` (see the mutation hooks' `onError` handlers).
