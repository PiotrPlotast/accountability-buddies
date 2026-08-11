# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                       # Expo dev server (Metro)
npm run ios / npm run android   # build & launch the dev client
npm run lint                    # expo lint . --fix (ESLint + Prettier)
npm test                        # Jest (coverage is always collected)
npm run test:watch
npx tsc --noEmit                # type-check; no script alias exists

npx jest __tests__/hooks/useToggleGoal.test.tsx     # single file
npx jest -t "rolls back the cache"                  # single test by name
```

`.env` needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY`. Expo inlines `EXPO_PUBLIC_*` at build time — changing them requires rebuilding the dev client, not just restarting Metro.

## Architecture

**Provider chain** (`app/_layout.tsx`): `PersistQueryClientProvider` (AsyncStorage persister, 24h `gcTime`, 5min `staleTime`) → `SupabaseProvider` → `ThemeProvider` → `Stack`. Routing is gated by `Stack.Protected guard={!!session}` swapping the `(protected)` and `(public)` groups. Never navigate between those groups directly — change the session and let the guard redirect. The splash screen hides only once `isLoaded && !isRestoring`.

**Supabase access** goes through `hooks/useSupabase.ts` (`{ isLoaded, session, supabase, signOut }`); the provider owns the single memoized client plus the `AppState` auto-refresh wiring. Don't construct clients elsewhere.

**Server state** is all TanStack Query. Keys live in `lib/queryKeys.ts` (`groupStats`, `groupMembers`, `profile`) — but `heatmap` is still an inline `["heatmap", userId]` literal in `useHeatmapData` and `useOptimisticGoalMutation`.

**All goal mutations must go through `lib/useOptimisticGoalMutation.ts`.** `useAddGoal`, `useToggleGoal`, `useEditGoal`, and `useDeleteGoal` are thin configs over it; the shared hook handles cancel → snapshot → patch the current user's `goals` inside the `["groupMembers", groupId]` cache → rollback on error (with an `Alert.alert`) → invalidate on settle. Options: `getGroupId`, `getPatch`, `beforeOptimistic` (haptics), `invalidateStatsOnSettle`, `getHeatmapDelta`. Writing a raw `useMutation` for goals will silently diverge from this contract.

**Composition hooks** are what screens consume: `useDashboardData` (group + members + `fetchData`, and redirects to `join-group` when the user has none), `useDashboardActions` (no-ops when `activeGroupId` is null, so callers need no guard), `useDashboardStatus`. Both `useDashboardData` and `useDashboardStatus` call `useGroupStats`/`useGroupMembers` independently — that's fine, they dedupe through the query cache.

**"Completed today" is derived, never stored.** `useGroupMembers` selects `goals(...logs(id))` filtered by `logs.date = today` and sets `completed_today = logs.length > 0`. Today is always `new Date().toLocaleDateString("en-CA")` → `YYYY-MM-DD`, wrapped as `getTodayLocalDate()` in `lib/date.ts`. Use that helper anywhere you compare against `logs.date` or `last_streak_date`.

**Backend contract**: tables `groups`, `group_members`, `goals`, `logs`, `profiles`; RPCs `get_my_group_stats`, `join_group_via_code`, `get_heatmap_logs`. `types/dashboardTypes.ts` mirrors these — nested types like `GoalRow.logs` reflect PostgREST `select()` nesting, not real columns. There is no `supabase/` directory in this repo despite the README's mention; schema changes are made in the Supabase dashboard.

### `repeat_days` day indexes

`goals.repeat_days` is stored as **Monday = 0 … Sunday = 6** — the order the day picker writes. JS `Date#getDay()` is Sunday = 0, so never compare a stored index against `getDay()` directly.

`lib/repeatDays.ts` owns the whole convention and is the only place that should know it: `getTodayDayIndex()` / `toRepeatDayIndex()` for the shift, `isScheduledOn()` and `filterGoalsForToday()` for the "is this due today" check, `formatRepeatDays()` for display, plus the shared `DAY_LABELS` / `DAY_NAMES` / `ALL_DAYS` constants. An empty or absent `repeat_days` means "every day".

## Styling

NativeWind v4 + the custom Tailwind theme in `tailwind.config.js` (`bg`, `surface`, `border`, `neon`, `text-muted`, `rounded-tile`, `font-mono*` Geist Mono). The content globs cover only `./app/**` and `./components/**` — classes written outside those paths generate nothing. Every screen file starts with an `import "../../global.css"` line; keep it when adding screens.

Static chrome colors that can't be Tailwind classes (navigator `contentStyle`) come from `lib/colors.ts`. The user-selectable accent is runtime state: `useTheme()` returns `{ accent: { hex, dim, shades }, setAccent, palette }`, persisted to AsyncStorage. Accent-colored UI uses inline `style={{ ... accent.hex }}`, not classes.

## Testing

`babel.config.js` drops the NativeWind preset when `NODE_ENV === "test"` (its CSS-interop transform breaks babel-jest), so className-driven styling is not exercised in tests.

`jest.setup.js` globally mocks `expo-router`, `expo-haptics`, `expo-clipboard`, reanimated, and — importantly — replaces `@/hooks/useSupabase` with a synchronous version that reads the fake client (and its `__testSession`) straight out of `SupabaseContext`.

Two gotchas when reading test output: `testPathIgnorePatterns` doesn't exclude `.kilo/worktrees/`, so an agent worktree checked out there gets its tests collected too and every suite appears to run twice against different source. And the suite is not green at HEAD — `Heatmap`, `ProgressRing`, `EditGoalModal`, and `DashboardHeader` fail (mostly missing `ThemeProvider` in the render wrapper), as do 7 `tsc --noEmit` errors. Compare against that baseline rather than assuming a change broke them.

Use `__tests__/test-utils/render.tsx`: `buildFakeSupabase({ fromImpl, rpcImpl })`, `makeQueryBuilder(result)` (a thenable chainable PostgREST stand-in), `makeQueryClient()` (infinite `gcTime`/`staleTime` so seeded cache data survives), `buildWrapper()`, and `renderHookWithSession()`. Mutation tests seed the cache with `queryClient.setQueryData(queryKeys.groupMembers(id), members)` and assert on both the Supabase call and the resulting cache state.

## Conventions

- `@/*` aliases the repo root; prefer `@/hooks/...` over relative imports.
- TypeScript `strict` + `noImplicitAny`; typed routes and React Compiler are enabled in `app.json`.
- User-facing errors are `Alert.alert` (mostly from the shared mutation hook's `onError`).
- Some inline comments are in Polish; that's fine — match the surrounding file.
- PRs follow `.github/PULL_REQUEST_TEMPLATE.md`; branches are named `feature/…`, `fix/…`, `refactor/…` off `main`.
