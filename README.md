# Habit Pals

A mobile app for shared habit tracking. Form a duo or a small group, set daily habits, tick them off as you go, and keep a group streak alive together. Buddies can nudge each other, habits can remind you at a set time, and you hear when a buddy ticks something off.

Built with Expo (React Native) and Supabase.

## Stack

- **Expo SDK 57** + **React Native 0.86** with the new architecture and React Compiler enabled
- **expo-router** for filesystem routing with typed routes and `Stack.Protected` auth gating
- **Supabase** (Auth, Postgres + RLS, RPCs, Edge Functions, pg_cron) for the backend
- **expo-notifications** + the Expo push service for nudges, reminders and buddy events
- **Reanimated 4** for the checkbox, list and progress ring animations
- **TanStack Query** for server state with optimistic mutations
- **NativeWind v4** (Tailwind) for styling
- **TypeScript 6** in `strict` mode
- **Jest** + `@testing-library/react-native` for tests

## Getting started

### Prerequisites

- Node 20+ and npm
- Xcode (iOS) and/or Android Studio (Android). The app uses a dev client, not Expo Go (push notifications and Sign in with Apple need native code)
- A Supabase project with every migration in `supabase/migrations/` applied (see [Backend](#backend))
- A physical iPhone to receive real pushes; the simulator registers a stand-in token

### Install

```bash
npm install
```

### Configure environment

**App:** copy `.env.example` to `.env` and fill in the two values from the Supabase dashboard (Project settings → API):

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=<your-anon-key>
```

Expo inlines `EXPO_PUBLIC_*` variables at build time, so you must rebuild the dev client after changing them.

**Edge Functions:** copy `supabase/functions/.env.example` to `supabase/functions/.env`, fill in `EXPO_ACCESS_TOKEN` and `DISPATCH_SECRET`, and upload them:

```bash
npx supabase secrets set --env-file supabase/functions/.env
```

**Vault (for the cron jobs):** in the SQL editor, store the project URL and the same `DISPATCH_SECRET` value:

```sql
select vault.create_secret('https://<your-project>.supabase.co', 'project_url');
select vault.create_secret('<same value as DISPATCH_SECRET>', 'dispatch_secret');
```

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
| `npx supabase db push` | Apply new migrations to the linked project |
| `npx supabase functions deploy <name>` | Deploy `send-nudge`, `check-receipts` or `dispatch-notifications` |

## Project layout

```
app/                       expo-router file tree
  _layout.tsx              PersistQueryClientProvider → SupabaseProvider → ThemeProvider → Stack.Protected guard
  (public)/                welcome, sign-in, sign-up
  (protected)/
    _layout.tsx            name gate, push registration, notification tap routing
    (tabs)/                native tabs — dashboard (index) + profile
    name.tsx               asks for a display name once
    join-group.tsx         fallback when the user has no group
    new-habit.tsx          create-habit screen
    group-settings.tsx     group name, icon, invite code
    notification-settings.tsx
  components/              dashboard, habits, profile UI
hooks/                     query/mutation hooks + composition hooks
lib/                       shared logic (dates, repeat days, haptics, push, query keys)
providers/                 Supabase client provider
types/                     row types mirroring the Supabase schema
supabase/
  migrations/              SQL migrations (tables, RLS, RPCs, cron jobs)
  functions/               Edge Functions (Deno): send-nudge, check-receipts, dispatch-notifications
  tests/                   psql test scripts for the SQL
__tests__/                 Jest tests
```

## Architecture

### Auth gate

`app/_layout.tsx` wraps the tree in `PersistQueryClientProvider` → `SupabaseProvider` → `ThemeProvider` → `Stack`, then uses `Stack.Protected guard={!!session}` to swap between the `(protected)` and `(public)` route groups based on the Supabase session. Don't navigate directly between groups — flip the session and let the guard redirect.

### Supabase client

`providers/supabase-provider.tsx` creates a single memoized client (with `AsyncStorage`, `processLock`, and `autoRefreshToken`) and wires an `AppState` listener for `startAutoRefresh` / `stopAutoRefresh` on foreground/background. `hooks/useSupabase.ts` is the only sanctioned consumer and exposes `{ isLoaded, session, supabase, signOut }`.

### Server state

All server data flows through TanStack Query, persisted to AsyncStorage so the last state shows on a cold start. Every query key is built in `lib/queryKeys.ts`. The two that drive the dashboard:

- `groupStats(userId)` — `useGroupStats` (calls the `get_my_group_stats` RPC)
- `groupMembers(groupId, date)` — `useGroupMembers` (joins `group_members` + `goals` + that day's `logs`); keyed by the local day so it rolls over at midnight

Goal mutations (`useAddGoal`, `useToggleGoal`, `useEditGoal`, `useDeleteGoal`) are thin configs over `lib/useOptimisticGoalMutation.ts`, which cancels and snapshots, patches the cache, rolls back with an alert on error and invalidates on settle. New goal mutations go through it rather than a raw `useMutation`.

"Completed today" is **derived**, not stored: `useGroupMembers` joins `logs` filtered by `date = today` and sets `completed_today = logs.length > 0`. Today is `getTodayLocalDate()` from `lib/date.ts` (`YYYY-MM-DD` in local time); use it wherever you compare against `logs.date` or `last_streak_date`.

### Composition hooks

Screens consume `useActiveGroup` (the pure group/members read), `useDashboardData` (the dashboard's refresh + join-group redirect on top of it, used by `Dashboard` only), and `useDashboardActions` rather than wiring the raw query/mutation hooks directly. `useDashboardActions` no-ops when `activeGroupId` is null, so callers don't need to guard.

## Backend

Everything the app expects lives in `supabase/migrations/`; apply it with `npx supabase db push`.

- **Tables:** `groups`, `group_members`, `goals`, `logs`, `profiles`, plus the notification tables `device_push_tokens`, `notification_prefs`, `notifications` and the server-only `push_tickets`
- **Client RPCs:** `get_my_group_stats`, `join_group_via_code`, `get_heatmap_logs`, `register_push_token`, `delete_my_account`
- **Edge Functions:** `send-nudge` (called by the app), and `check-receipts` and `dispatch-notifications` (called by pg_cron hourly and every 5 minutes; they send reminders and buddy events and clean up dead tokens)

`types/dashboardTypes.ts` mirrors these shapes — keep it in sync when the schema changes. Note that nested row types (e.g. `GoalRow.logs`, `GroupMemberRow.profiles`) reflect Supabase's `select("...foo(...)")` nesting, not the actual column layout.

SQL behaviour is tested by the psql scripts in `supabase/tests/`; run one against a database with every migration applied:

```bash
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/group_streak.sql
```

`CLAUDE.md` has the full architecture notes.

## Conventions

- Path alias `@/*` maps to the repo root. Prefer `@/hooks/...`, `@/types/...`, `@/providers/...` over relative imports.
- TypeScript `strict` and `noImplicitAny` are on.
- User-facing errors use `Alert.alert` (see `onError` in `lib/useOptimisticGoalMutation.ts`).
- Haptics only through `lib/haptics.ts`, push plumbing only through `lib/push.ts`.
- NativeWind/Tailwind only scans `./app/**` and `./components/**` — classes in files outside those globs won't be generated.
