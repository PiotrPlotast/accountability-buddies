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

**All haptics go through `lib/haptics.ts`** — the only file allowed to import `expo-haptics`. It exports domain names, not API names: `tapLight`, `toggleDone`, `toggleUndone`, `destructive`, `celebrate`, `error`. Three rules the file states in its own header and that a reviewer should hold you to: one kill switch (every function returns early on a module-level flag, so no call site branches on it), never `await` (they return `void` and swallow their own failure, because a buzz must not delay an optimistic update), and never vibrate in response to server data — a vibration confirms the user's touch, so `celebrate()` fires from the toggle path, never from an effect watching the cache. Goal mutations reach it through `beforeOptimistic`; `onError` in the shared hook fires `error()` beside the `Alert.alert`.

**All push plumbing goes through `lib/push.ts`** — the only file allowed to import `expo-notifications`, the way `lib/haptics.ts` is the only importer of `expo-haptics`. It exports `registerForPushNotificationsAsync()`, `configureNotificationHandler()` and the module-level token memory (`getRegisteredPushToken` / `forgetRegisteredPushToken`). Three rules the file states in its own header: **nothing throws** — registration runs from an effect on first paint with no user action behind it, so every failure comes back as a `status` (`"denied"`, `"unsupported"`, `"error"`) for a screen to render rather than an `Alert` nobody asked for; **`canAskAgain` is the whole prompt condition**, because iOS shows the system prompt once per install and the route back for someone who declined is a Settings deep link, not a second prompt; and **`SIMULATOR_PUSH_TOKEN`** (`ExponentPushToken[SIMULATOR]`, `__DEV__ && !Device.isDevice` only) stands in for a real token so the RPC, the settings screen and the denied state are all exercisable without a phone — it passes `register_push_token`'s prefix check on purpose and is recognisably fake in the table. `configureNotificationHandler()` is called at module scope from `app/_layout.tsx`: without a handler iOS suppresses foreground notifications entirely, so a push sent while the app is open looks like it was never delivered.

**`usePushRegistration` mounts in exactly one place** — `app/(protected)/_layout.tsx`, the only layout that renders behind the session guard. It is keyed on the user id, so a token refresh does not re-register but an account switch does: the row has to move to its new owner or the previous user keeps getting this phone's pushes. That hand-over is why writes go through the `SECURITY DEFINER` `register_push_token(token, device_id, platform)` RPC and never a client upsert — `device_push_tokens` has SELECT and DELETE policies only, since no policy keyed on `auth.uid()` can overwrite a row somebody else owns without also letting anyone steal any token. `p_device_id` comes from `lib/deviceId.ts`: a UUID minted once per install and kept in AsyncStorage, the only value that survives a token rotation.

**Sign-out deletes this device's token row first.** `signOut` in `providers/supabase-provider.tsx` deletes from `device_push_tokens` *by token* — not by user, which would silence the person's other phones — **before** `auth.signOut()`, while the JWT that authorises the delete is still valid, and then clears the cache and the persister as before. A failure is swallowed the same way the persister removal is: nobody is held in a session they have asked to leave because the cleanup was offline, and `register_push_token` reassigns the orphaned row the next time anyone signs in on that device.

**`isDayComplete(goals)` in `lib/isDayComplete.ts`** is the one definition of "closed out the day": the goals scheduled for today (via `filterGoalsForToday`) are non-empty and all `completed_today`. An empty schedule is `false` — a day with nothing due was never closed out. It has two consumers already, the `celebrate()` haptic and the ring pulse, and E5's `buddy_done` SQL has to agree with it, `extract(isodow) - 1` included.

**One display name, and the gate that collects it.** `profiles.full_name` is the only name column — `nickname` was dropped in E2 PR 1 — and `lib/displayName.ts` owns the whole definition: `normalizeName`, `isValidName`, `MAX_NAME_LENGTH`, and `hasDisplayName(profile)`, which is what "named" means everywhere. Everyone is asked once, on `app/(protected)/name.tsx`, email and Apple sign-in alike — so no code path depends on the name Apple hands over exactly once and never again.

**The name gate is a guard, not a redirect effect.** `(protected)/_layout.tsx` swaps the whole group out for the name screen on `useNameGate().needsName`, the same way the root layout swaps `(protected)` for `(public)` on the session — so a nameless user never mounts the dashboard and there is no second effect racing the join-group redirect. `useNameGate` reports `isResolved` separately from `needsName` because "profile not read yet" must not look like "has no name", or every returning user with a cold cache gets a flash of the name screen. `useDashboardData`'s join-group redirect waits on that same gate (`if (!nameResolved || needsName) return;`) to cover the window before the profile resolves. A brand new account has neither a name nor a group; the name screen owns that user.

**Composition hooks** are what screens consume: `useDashboardData` (group + members + `fetchData`, and redirects to `join-group` when the user has none), `useDashboardActions` (no-ops when `activeGroupId` is null, so callers need no guard), `useDashboardStatus`. Both `useDashboardData` and `useDashboardStatus` call `useGroupStats`/`useGroupMembers` independently — that's fine, they dedupe through the query cache.

**"Completed today" is derived, never stored.** `useGroupMembers` selects `goals(...logs(id))` filtered by `logs.date = today` and sets `completed_today = logs.length > 0`. Today is always `new Date().toLocaleDateString("en-CA")` → `YYYY-MM-DD`, wrapped as `getTodayLocalDate()` in `lib/date.ts`. Use that helper anywhere you compare against `logs.date` or `last_streak_date`.

**Backend contract**: tables `groups`, `group_members`, `goals`, `logs`, `profiles`, plus the E3 notification tables `device_push_tokens`, `notification_prefs`, `notifications`; RPCs `get_my_group_stats`, `join_group_via_code`, `get_heatmap_logs`, `register_push_token`, `delete_my_account` (`SECURITY DEFINER`; the client cannot reach `auth.users`, and nothing cascades off `profiles`, so it deletes goals → group_members → groups → profiles → auth.users in that order and drops a group whose last member just left). The notification tables are the exception to "nothing cascades": tokens, prefs and received notifications cascade off `auth.users`, and `notifications.sender_id`/`group_id` are `SET NULL`, so `delete_my_account` needed no change. **Tokens have no client INSERT/UPDATE policy** — a phone switching accounts must take over a row owned by the previous user, which only the `SECURITY DEFINER` `register_push_token` RPC can do; the client may select and delete its own rows (Phase 3's sign-out must delete this device's token *before* `auth.signOut()`, while RLS still has a JWT). `notification_prefs` rows are created by a trigger on `auth.users` (existing users were backfilled), so the client only ever updates its row. `notifications` has no client write path except `update (read_at)`, enforced by a column grant, and every insert must supply a `dedupe_key` — that unique constraint is the idempotency story. `types/dashboardTypes.ts` mirrors these — nested types like `GoalRow.logs` reflect PostgREST `select()` nesting, not real columns. The `supabase/` directory holds the CLI project (`config.toml`) and committed migrations pulled from the live project (ref `rlvhncdzrfwjpohiqqfv`). Apply schema changes with `npx supabase db push`; re-sync from the dashboard with `npx supabase db pull <name> --diff-engine migra` — the default `pg-delta` engine fails against this project's pooler (`EAUTHQUERY` on the temp login role). Some schema still originates in the dashboard, so pull before diffing.

**What the database refuses to store.** A `logs` row may only point at a goal you own, must be dated within a day of the server's `current_date` (the client sends its own local date, so the window is one day wide either side), and is unique per `(goal_id, user_id, date)` — so "completed today" cannot be written on someone else's behalf, backdated to rewrite a group streak, or double-counted in the heatmap. `check_daily_streak` never moves `last_streak_date` backwards for the same reason. Invite codes are ten uppercase hex characters from `generate_invite_code()` (`gen_random_bytes`, not `random()`); the lookup in `join_group_via_code` is trimmed and case-insensitive, the group's creator may rotate a code, and any member may leave a group — the last two were impossible before E5's security pass, which left a leaked code unrevocable.

### Stacked modals

The dashboard hosts three modals (habit manager, edit, delete) and the manager can ask for the other two. Presenting a modal while the pageSheet manager is still dismissing drops it on iOS, so `Dashboard.tsx` queues the request in `pendingAction`, closes the manager, and opens the queued modal from `Modal.onDismiss` — falling back to a visibility effect off iOS, where `onDismiss` never fires. Child modals report intent and never sequence themselves; don't reintroduce a `setTimeout` to wait out an animation.

The icon and repeat-day controls are shared between habit creation and editing via `app/components/habits/{IconPicker,DayPicker}.tsx`.

### Animations

Reanimated 4 with `newArchEnabled`, so layout animations work without extra setup. The animated surfaces are `GoalList` (the checkbox and the rows) and `ProgressRing` (the sweep and the day-close pulse); `DashboardHeader` animates nothing itself, it subscribes to the day-close signal and hands the ring a `pulseKey`. Two rules hold them together:

**Nothing animates on first paint.** Every animation runs through `hooks/useOnValueChange.ts`, which fires on a change and never on mount. Without it the ring sweeps up from zero every time the dashboard mounts and the checkbox springs for habits ticked hours ago.

**The day-close pulse is an event, not a derived state.** `lib/dayCompleteSignal.ts` is a module-level emitter (`emitDayComplete` / `onDayComplete` / `useDayCompleteSignal`) that `useToggleGoal` fires from the same branch as `celebrate()`. Deriving the pulse from `progress === 1` instead would fire it on a refetch, on a tab switch, and on every launch on an already-finished day — the animation version of the third haptics rule. `ProgressRing` takes it as an optional `pulseKey` and never decides to celebrate on its own.

`useReducedMotion()` degrades movement only: no springs, no scale, no sliding, but colour cross-fades and opacity stay, since losing them makes the checkbox snap between two very different colours. NativeWind doesn't support `className` on a `Reanimated.View`, so animated components use inline styles.

### `repeat_days` day indexes

`goals.repeat_days` is stored as **Monday = 0 … Sunday = 6** — the order the day picker writes. JS `Date#getDay()` is Sunday = 0, so never compare a stored index against `getDay()` directly.

`lib/repeatDays.ts` owns the whole convention and is the only place that should know it: `getTodayDayIndex()` / `toRepeatDayIndex()` for the shift, `isScheduledOn()` and `filterGoalsForToday()` for the "is this due today" check, `formatRepeatDays()` for display, plus the shared `DAY_LABELS` / `DAY_NAMES` / `ALL_DAYS` constants. An empty or absent `repeat_days` means "every day".

In SQL the same index is `extract(isodow from local_ts)::int - 1` — never `extract(dow ...)`, which is Sunday = 0. `goals.reminder_time` (E3) is a wall-clock `time` in the owner's `notification_prefs.timezone`, and quiet hours may wrap midnight, so don't compare them with a plain `BETWEEN`.

## Styling

NativeWind v4 + the custom Tailwind theme in `tailwind.config.js` (`bg`, `surface`, `border`, `neon`, `text-muted`, `rounded-tile`, `font-mono*` Geist Mono). The content globs cover only `./app/**` and `./components/**` — classes written outside those paths generate nothing. Every screen file starts with an `import "../../global.css"` line; keep it when adding screens.

Static chrome colors that can't be Tailwind classes (navigator `contentStyle`) come from `lib/colors.ts`. The user-selectable accent is runtime state: `useTheme()` returns `{ accentId, accent: { hex, dim, shades }, setAccent, palette, hapticsEnabled, setHapticsEnabled, hydrated }`, persisted to AsyncStorage. Accent-colored UI uses inline `style={{ ... accent.hex }}`, not classes.

`hapticsEnabled` is a per-device preference alongside the accent, and the context copy exists only so the settings row in `Profile.tsx` has something to render — the copy that call sites actually obey lives in `lib/haptics.ts`, which the provider syncs on hydration and on every toggle. E3 moves that switch onto the "Notifications and feedback" screen.

## Testing

Tests come first — see **Workflow** above.

`babel.config.js` drops the NativeWind preset when `NODE_ENV === "test"` (its CSS-interop transform breaks babel-jest), so className-driven styling is not exercised in tests.

`jest.setup.js` globally mocks `expo-router`, `expo-haptics`, `expo-clipboard`, `expo-apple-authentication`, `expo-notifications`, `expo-device`, `expo-constants`, reanimated, `react-native-worklets`, `react-native-safe-area-context` (the library's own default-exported mock), and replaces `@/hooks/useTheme` with a synchronous version. (`@/hooks/useSupabase` is deliberately *not* mocked — it is a plain `useContext` read that `buildWrapper` fills synchronously, so tests exercise the real hook.) **`react-native-worklets` has to be mocked before reanimated**: since 4.2 reanimated's own mock imports runtime values from `./index`, which boots worklets and throws "Native part of Worklets doesn't seem to be initialized". Worklets ships a mock of its own, so mocking that layer keeps the chain inert; the package is in `transformIgnorePatterns` for the same reason. Two mocks are also deliberately wider than the libraries' own: the shipped reanimated mock omits `useReducedMotion` ("ADD ME IF NEEDED" in its source), so it's supplied here and defaults to false, and the `expo-haptics` feedback-type enums are filled in completely, because a missing member reads as `undefined` and the call still "succeeds" — a half-filled mock hides exactly the bug it should catch. The `expo-notifications` and `expo-device` mocks carry `__esModule: true` for a related reason: without it babel's interop hands every importer its own copy of the namespace, so `jest.replaceProperty(Device, "isDevice", false)` in a test mutates a copy the module under test never reads, and the test fails against correct code. The `useTheme` stub returns a fixed accent so themed components don't need a real `ThemeProvider` hydrating from AsyncStorage. Add new provider-backed hooks to that list rather than wrapping each test.

Two things to know when reading test output:

- **The baseline is green.** As of 2026-09-18 on Expo SDK 57: 38 suites, 243 tests passing, `tsc --noEmit` clean under TypeScript 6, `npx expo-doctor` 21/21. A failure is a real regression, not pre-existing drift.
- **`npm run lint` is *not* clean — 10 errors and 4 warnings (11 errors once `expo start` has regenerated `expo-env.d.ts` without its trailing newline), none of them yours.** Two are missing display names in `jest.setup.js`'s `expo-router` mock, and one is a `prettier/prettier` missing newline in `expo-env.d.ts` — a generated file, so `--fix` rewrites it and the next `expo start` puts it back. The other eight arrived with eslint-config-expo 56, which turned on the React Compiler-era hook rules (`set-state-in-effect`, `immutability`, `globals`); they flag long-standing patterns in `Dashboard.tsx`, `GoalList.tsx`, `EditGoalModal.tsx`, `group-settings.tsx` and two provider tests. Worth fixing on their own terms — `reactCompiler` is on in `app.json` — but not as a side effect of unrelated work.
- Jest doesn't exit on its own after any suite that renders React ("Jest did not exit one second after the test run has completed"), so a plain `npx jest <file>` hangs until killed — use `--forceExit`. It also warns about a worker that failed to exit gracefully; that's the same leak and is expected.

`testPathIgnorePatterns` in `package.json` already covers `.claude/worktrees/`, so an agent worktree checked out there doesn't get its tests collected alongside this repo's. **The flip side: inside such a worktree `npx jest` finds nothing at all** and exits 1 with "No tests found" — every path it would collect is under the ignored prefix. Run the suite from there with the pattern overridden: `npx jest --forceExit --testPathIgnorePatterns "/node_modules/" "/android/" "/ios/" "/__tests__/test-utils/"`. A fresh worktree also has no `node_modules` and no generated `expo-env.d.ts`, so `npm install` comes first and `tsc --noEmit` reports nine `TS2882` errors for the `global.css` side-effect imports until `expo start` has run once.

Use `__tests__/test-utils/render.tsx`: `buildFakeSupabase({ fromImpl, rpcImpl })`, `makeQueryBuilder(result)` (a thenable chainable PostgREST stand-in), `makeQueryClient()` (infinite `gcTime`/`staleTime` so seeded cache data survives), `buildWrapper()`, and `renderHookWithSession()`. Mutation tests seed the cache with `queryClient.setQueryData(queryKeys.groupMembers(id), members)` and assert on both the Supabase call and the resulting cache state.

## Conventions

- `@/*` aliases the repo root; prefer `@/hooks/...` over relative imports.
- TypeScript `strict` + `noImplicitAny`; typed routes and React Compiler are enabled in `app.json`.
- User-facing errors are `Alert.alert` (mostly from the shared mutation hook's `onError`).
- Some inline comments are in Polish; that's fine — match the surrounding file.
- PRs follow `.github/PULL_REQUEST_TEMPLATE.md`; branches are named `feature/…`, `fix/…`, `refactor/…` off `main`.
