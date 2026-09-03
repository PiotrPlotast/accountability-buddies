# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

**Ask for the specific requirements before writing anything.** Every feature or bug-fix request starts with questions back to the user — never infer the spec from the code or fill gaps with assumptions. Ask about the exact user-visible behaviour, the edge cases (empty state, offline/failed mutation, a goal with no `repeat_days`, a user with no group), what should *not* change, and how you'll know it works. Ask even when the request looks obvious; the answers are the test cases. Don't touch a file until they're answered.

**TDD is the default loop.** For any change to a hook, a `lib/` module, or a component:

1. Write the tests first, in `__tests__/`, one per agreed behaviour including the edge cases. No implementation file is opened yet.
2. Run them and confirm they fail *for the right reason* — `npx jest <file> --forceExit`. A new test that passes before the code exists is testing nothing; fix the test.
3. Write the smallest implementation that makes them pass.
4. Re-run `npm test`, then `npx tsc --noEmit`, then `npm run lint`.
5. Refactor only once the suite is green, re-running it after each step.

Never write the implementation first and backfill tests against it — a test written to match existing behaviour encodes whatever bug is already there.

Changes that genuinely aren't testable here — styling and copy, `app.json`/config, docs, SQL migrations — skip step 1, but say out loud that you're skipping it and why rather than dropping it quietly. Everything else gets a failing test first.

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

**`ios/` and `android/` are gitignored generated output**, so `app.json` is the only source of truth for anything native. The app identifier is `com.piotrplotast.accountabilitybuddies` on both platforms (`ios.bundleIdentifier` / `android.package`). Editing it in `app.json` does **not** touch a native project already on disk — `project.pbxproj`, `build.gradle`'s `namespace`/`applicationId` and the Java package directory keep the old value until you run `npx expo prebuild --clean`. Until that runs, a local build still installs under the old identifier, which is what push credentials and Sign in with Apple key off.

## Architecture

**Provider chain** (`app/_layout.tsx`): `PersistQueryClientProvider` (AsyncStorage persister, 24h `gcTime`, 5min `staleTime`) → `SupabaseProvider` → `ThemeProvider` → `Stack`. Routing is gated by `Stack.Protected guard={!!session}` swapping the `(protected)` and `(public)` groups. Never navigate between those groups directly — change the session and let the guard redirect. The splash screen hides only once `isLoaded && !isRestoring`.

**Supabase access** goes through `hooks/useSupabase.ts` (`{ isLoaded, session, supabase, signOut }`); the provider owns the single memoized client plus the `AppState` auto-refresh wiring. Don't construct clients elsewhere.

**Server state** is all TanStack Query. Every key lives in `lib/queryKeys.ts` (`groupStats`, `groupMembers`, `profile`, `heatmap`) — build keys through it rather than writing an array literal at the call site.

**All goal mutations must go through `lib/useOptimisticGoalMutation.ts`.** `useAddGoal`, `useToggleGoal`, `useEditGoal`, and `useDeleteGoal` are thin configs over it; the shared hook handles cancel → snapshot → patch the current user's `goals` inside the `["groupMembers", groupId]` cache → rollback on error (with an `Alert.alert`) → invalidate on settle. Options: `getGroupId`, `getPatch`, `beforeOptimistic` (haptics), `invalidateStatsOnSettle`, `getHeatmapDelta`. Writing a raw `useMutation` for goals will silently diverge from this contract.

**Composition hooks** are what screens consume: `useDashboardData` (group + members + `fetchData`, and redirects to `join-group` when the user has none), `useDashboardActions` (no-ops when `activeGroupId` is null, so callers need no guard), `useDashboardStatus`. Both `useDashboardData` and `useDashboardStatus` call `useGroupStats`/`useGroupMembers` independently — that's fine, they dedupe through the query cache.

**"Completed today" is derived, never stored.** `useGroupMembers` selects `goals(...logs(id))` filtered by `logs.date = today` and sets `completed_today = logs.length > 0`. Today is always `new Date().toLocaleDateString("en-CA")` → `YYYY-MM-DD`, wrapped as `getTodayLocalDate()` in `lib/date.ts`. Use that helper anywhere you compare against `logs.date` or `last_streak_date`.

**Backend contract**: tables `groups`, `group_members`, `goals`, `logs`, `profiles`; RPCs `get_my_group_stats`, `join_group_via_code`, `get_heatmap_logs`. `types/dashboardTypes.ts` mirrors these — nested types like `GoalRow.logs` reflect PostgREST `select()` nesting, not real columns. The `supabase/` directory holds the CLI project (`config.toml`) and committed migrations pulled from the live project (ref `rlvhncdzrfwjpohiqqfv`). Apply schema changes with `npx supabase db push`; re-sync from the dashboard with `npx supabase db pull <name> --diff-engine migra` — the default `pg-delta` engine fails against this project's pooler (`EAUTHQUERY` on the temp login role). Some schema still originates in the dashboard, so pull before diffing.

### Stacked modals

The dashboard hosts three modals (habit manager, edit, delete) and the manager can ask for the other two. Presenting a modal while the pageSheet manager is still dismissing drops it on iOS, so `Dashboard.tsx` queues the request in `pendingAction`, closes the manager, and opens the queued modal from `Modal.onDismiss` — falling back to a visibility effect off iOS, where `onDismiss` never fires. Child modals report intent and never sequence themselves; don't reintroduce a `setTimeout` to wait out an animation.

The icon and repeat-day controls are shared between habit creation and editing via `app/components/habits/{IconPicker,DayPicker}.tsx`.

### `repeat_days` day indexes

`goals.repeat_days` is stored as **Monday = 0 … Sunday = 6** — the order the day picker writes. JS `Date#getDay()` is Sunday = 0, so never compare a stored index against `getDay()` directly.

`lib/repeatDays.ts` owns the whole convention and is the only place that should know it: `getTodayDayIndex()` / `toRepeatDayIndex()` for the shift, `isScheduledOn()` and `filterGoalsForToday()` for the "is this due today" check, `formatRepeatDays()` for display, plus the shared `DAY_LABELS` / `DAY_NAMES` / `ALL_DAYS` constants. An empty or absent `repeat_days` means "every day".

## Styling

NativeWind v4 + the custom Tailwind theme in `tailwind.config.js` (`bg`, `surface`, `border`, `neon`, `text-muted`, `rounded-tile`, `font-mono*` Geist Mono). The content globs cover only `./app/**` and `./components/**` — classes written outside those paths generate nothing. Every screen file starts with an `import "../../global.css"` line; keep it when adding screens.

Static chrome colors that can't be Tailwind classes (navigator `contentStyle`) come from `lib/colors.ts`. The user-selectable accent is runtime state: `useTheme()` returns `{ accent: { hex, dim, shades }, setAccent, palette }`, persisted to AsyncStorage. Accent-colored UI uses inline `style={{ ... accent.hex }}`, not classes.

## Testing

Tests come first — see **Workflow** above.

`babel.config.js` drops the NativeWind preset when `NODE_ENV === "test"` (its CSS-interop transform breaks babel-jest), so className-driven styling is not exercised in tests.

`jest.setup.js` globally mocks `expo-router`, `expo-haptics`, `expo-clipboard`, reanimated, `react-native-safe-area-context` (the library's own default-exported mock), and — importantly — replaces `@/hooks/useSupabase` and `@/hooks/useTheme` with synchronous versions. The `useSupabase` stub reads the fake client (and its `__testSession`) straight out of `SupabaseContext`; the `useTheme` stub returns a fixed accent so themed components don't need a real `ThemeProvider` hydrating from AsyncStorage. Add new provider-backed hooks to that list rather than wrapping each test.

Two things to know when reading test output:

- **The baseline is green.** As of 2026-09-01: 23 suites, 122 tests passing, `tsc --noEmit` clean. A failure is a real regression, not pre-existing drift.
- Jest doesn't exit on its own after any suite that renders React ("Jest did not exit one second after the test run has completed"), so a plain `npx jest <file>` hangs until killed — use `--forceExit`. It also warns about a worker that failed to exit gracefully; that's the same leak and is expected.

`testPathIgnorePatterns` in `package.json` already covers `.claude/worktrees/`, so an agent worktree checked out there doesn't get its tests collected alongside this repo's.

Use `__tests__/test-utils/render.tsx`: `buildFakeSupabase({ fromImpl, rpcImpl })`, `makeQueryBuilder(result)` (a thenable chainable PostgREST stand-in), `makeQueryClient()` (infinite `gcTime`/`staleTime` so seeded cache data survives), `buildWrapper()`, and `renderHookWithSession()`. Mutation tests seed the cache with `queryClient.setQueryData(queryKeys.groupMembers(id), members)` and assert on both the Supabase call and the resulting cache state.

## Conventions

- `@/*` aliases the repo root; prefer `@/hooks/...` over relative imports.
- TypeScript `strict` + `noImplicitAny`; typed routes and React Compiler are enabled in `app.json`.
- User-facing errors are `Alert.alert` (mostly from the shared mutation hook's `onError`).
- Some inline comments are in Polish; that's fine — match the surrounding file.
- PRs follow `.github/PULL_REQUEST_TEMPLATE.md`; branches are named `feature/…`, `fix/…`, `refactor/…` off `main`.
