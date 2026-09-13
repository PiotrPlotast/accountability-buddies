# Roadmap — Accountability Buddies

Ties together five streams of work: push notifications, nudges, animations +
haptics, Sign in with Apple (Google deferred), and release polish. The details of push and
nudges live in `todo/push-notifications.md` — this document sets the **order and
the dependencies**, it does not repeat that plan.

## Starting state (verified 2026-09-01; E1 rows 2026-09-04, toolchain rows 2026-09-05)

| Area | State |
| --- | --- |
| Expo SDK | **57** — upgraded from 54 one SDK at a time on 2026-09-05 (PR #31). RN 0.86.3, React 19.2.3, TypeScript 6. Expo Go is reachable again; `expo-doctor` 21/21 |
| Tests | **green** — 27 suites, 169 tests, `tsc --noEmit` clean (was 23/122 on 2026-09-01) |
| Lint | **not clean** — 10 errors, 4 warnings. Eight errors arrived with eslint-config-expo 56; see E6 |
| Xcode | **26.6** (iOS SDK 26.5), updated 2026-09-05 — clear of the **26.4** minimum SDK 56 introduced. Not a blocker on anything |
| Push | no app code yet; the plan is ready in `todo/push-notifications.md`. The iOS APNs key **exists** — created and assigned 2026-09-03 |
| Haptics | **done (E1)** — `lib/haptics.ts` is the only importer of `expo-haptics`; every goal mutation, the pickers and the tab strip go through it |
| Animations | **done (E1)** — checkbox, ring, list transitions and the day-close pulse, all degrading under Reduce Motion |
| Sign-in | email + password + OTP only (`useSignIn` / `useSignUp`). **Sign in with Apple is next (E2); Google is deferred, maybe never** |
| Names | **two columns, read in different places** — buddies see `full_name` (`useGroupMembers.tsx:28`), you see `nickname` (`useProfile.tsx:17`). Both live users have both filled and they differ. E2 collapses them into `full_name` |
| Bundle ID | `com.piotrplotast.accountabilitybuddies` — changed and prebuilt 2026-09-02 |
| Apple account | **active** — Apple Developer Program paid for and approved 2026-09-03 |

## The one dependency that orders everything else

```
bundle ID change  →  Apple Developer Program ($99)  →  ┬→ push on iOS
                                                       └→ Sign in with Apple
```

A paid Apple account unblocks **two** of the five things at once: the
`aps-environment` entitlement (push) and the "Sign in with Apple" capability.
One enrollment, two features — which is why both streams are planned together
rather than separately.

**That gate has been open since 2026-09-03.** The account is active and the
bundle ID was changed before it, so no stage of this roadmap is waiting on
anything external any more. The order below stops being forced by a queue and
becomes a choice.

**The bundle ID changes before anything is wired up to Apple.** The App ID, the
APNs `.p8` key, the Services ID and the provisioning profiles are all tied to
the identifier. Changing it after the credentials are configured means walking
that entire path a second time — and it is the only step in the project that
cannot be undone with a single commit.

---

## E0 — Foundation (~half a day of work; the wait on Apple is over)

Everything here is cheap and unblocks the rest. Do it in this order.

1. ~~**New bundle ID / package**~~ — **done 2026-09-02.**
   `com.piotrplotast.accountabilitybuddies` in `app.json`, carried into the
   native projects by prebuild (`PRODUCT_BUNDLE_IDENTIFIER`,
   `namespace`/`applicationId`, the Java package directory), old directory
   removed. The `.apns` fixtures and `simctl push` commands in
   `todo/push-notifications.md` were updated too. Zero occurrences of the old ID
   anywhere in the tree. **Apple credentials are safe to touch.**
2. ~~**Enrol in the Apple Developer Program.**~~ — **done 2026-09-03.**
   The paid account is active, and the bundle ID has not moved since the
   `prebuild --clean` of 2026-09-02, so the App ID, the APNs key and the
   Services ID can all be created against `com.piotrplotast.accountabilitybuddies`
   with no risk of having to walk that path twice.
3. ~~**Merge `feature/supabase-cli-security-hardening` into `main`** and delete
   the stale local branches~~ — **done 2026-09-02.** PR #24 merged (`16544ac`),
   14 merged branches deleted. The suite on `main` was green: 23 suites,
   122 tests.

   **Finished off 2026-09-06: the repository is now `main` and nothing else**,
   local and remote, with no stashes and no extra worktrees.
   `fix/habits-manager-modal-flow` was fully merged.
   `fix/week-strip-today-pulse` looked like it still held three commits —
   `git log main..branch` listed them — but each had a patch-id identical to a
   commit already on `main` (`b3c499b`, `e7c0aef`, `256631e`): the branch had
   been rebased after PR #25 merged, so the same work existed under new SHAs.
   **Compare patch-ids, not hashes, before deleting a branch that looks
   unmerged** — a rebase makes identical work look like lost work.
   `refactor/switch-to-tanstack`, `worktree-fix+ui-ux-round-1` and
   `fix/accessibility` were already gone from the remote by then.
4. ~~**Fix CLAUDE.md**~~ — **done 2026-09-02.** The stale test baseline and the
   paragraph about the inline `heatmap` key were corrected; a paragraph was
   added explaining that `ios/`/`android/` are gitignored generated output and
   that the identifier only changes through `app.json` + `prebuild --clean`.

**E0 is closed.** The last item was the sign-off — a build confirming the changed
identifier installs cleanly — and the app is running on a physical iPhone as of
2026-09-08. Nothing here blocks the later stages.

The SDK upgrade briefly put a toolchain gate in front of this: SDK 56 raised
the minimum to Xcode 26.4. **That is settled — Xcode was updated to 26.6 on
2026-09-05**, so nothing external stands between here and the sign-off.

One thing to do first, since both landed after the last prebuild:
`expo-system-ui` was added and `react-native-worklets-core` removed, so the
native projects want one `npx expo prebuild --clean && npx pod-install` before
that first device build.

~~The first thing worth doing with the new account is `eas credentials` → iOS →
push key.~~ — **done 2026-09-03.** Generated through
`eas credentials` → iOS → `development` → "Set up your project to use Push
Notifications", which created the APNs `.p8` key and assigned it to
`com.piotrplotast.accountabilitybuddies`. It is account-wide — one key covers
every app and both the sandbox and production environments (Apple caps an
account at two), so this does not get revisited. **Day one of E3 is now ordinary
coding rather than code signing.**

The verification gate from `todo/push-notifications.md` — a real
`ExponentPushToken` from a physical iPhone and a test push from
https://expo.dev/notifications — is reachable as soon as token registration
exists, and it still applies before any feature code gets written.

**The Android half is still outstanding**: an FCM v1 service-account JSON has to
be uploaded to EAS. That is not a gate on anything today — it sits inside E3
proper — but the credential work is half done, not done.

---

## E1 — Animations and haptics — **done 2026-09-04**

Landed in two PRs off `feature/haptics-layer` and `feature/haptics-animations`:
**#27** (haptics, merged as `f10b175`) and **#29** (animations, merged as
`2edf539`). #29 replaces #28, which GitHub closed on its own when #27's branch
was deleted out from under it — a stacked PR whose base ref disappears cannot be
reopened, so the child has to be retargeted before the parent's branch goes.

Everything below is the plan as written before the work; it is kept for the
reasoning, not as an outstanding list. What actually shipped is recorded under
**Shipped** at the end of the stage. The haptics half has its own plan in
`todo/haptics.md`, followed as written.

### Haptics — one source of truth first

`lib/haptics.ts` (new) — a thin layer over `expo-haptics` with names from the
domain, not from the API:

```ts
tapLight()      // any tap in a list / tab
toggleDone()    // ticking off a habit    → NotificationFeedbackType.Success
toggleUndone()  // undoing that           → ImpactFeedbackStyle.Light
destructive()   // deleting a habit       → Warning
celebrate()     // closing out the day    → a sequence of 2–3 pulses
error()         // rollback from mutation → Error
```

Three rules worth writing into that file as a comment:

- **One kill switch.** `hapticsEnabled` in `useTheme()` (next to `accent`, same
  AsyncStorage) — haptics are a per-device preference, exactly like the accent
  colour. The whole layer reads the flag in one place; the call sites do not.
- **Never `await`.** Haptics must not delay an optimistic update. In
  `useOptimisticGoalMutation` we call them from `beforeOptimistic` — that hook
  already has the hook point.
- **Never vibrate in response to server data.** A vibration confirms *the user's
  touch*. A cache refresh that buzzes is a ghost in the phone.

Wire it into: `useToggleGoal` (already there — move it onto the layer),
`useAddGoal`, `useEditGoal`, `useDeleteGoal`, `MemberTabs`, `DayPicker`,
`IconPicker`, and `onError` in `useOptimisticGoalMutation`.

### Animations — the four places that actually pay off

Reanimated 4 + `react-native-worklets` are already installed and
`newArchEnabled` is `true`, so layout animations and `LinearTransition` work out
of the box.

1. **Ticking off a habit** (`GoalList.tsx`) — a spring on the checkbox scale
   plus a colour transition. The most frequent gesture in the app, so the
   biggest return.
2. **`ProgressRing`** — an animated `strokeDashoffset` instead of the value
   jumping. `useAnimatedProps` on `<Circle>` from `react-native-svg` (already a
   dependency).
3. **List reordering** — `LinearTransition` on the rows plus `FadeIn`/`FadeOut`
   on insert/remove. Today an optimistic insert pops in abruptly.
4. **Closing out the day** — one clear reward when the last scheduled habit
   lands: a pulse of the ring plus `celebrate()`. This is the same
   "everything done" condition that E5 will use for the `buddy_done`
   notification — **pull it out into a pure function in `lib/`** (e.g.
   `isDayComplete(goals)`), because it gets used twice and only that shape is
   testable.

### Accessibility and tests

- `useReducedMotion()` from Reanimated → degrade to opacity transitions. The iOS
  "Reduce Motion" setting is real, not exotic.
- `jest.setup.js` already mocks `expo-haptics` and reanimated globally, so
  **assertions on haptics are free** — "ticking off calls `toggleDone`" is an
  ordinary test. We do not test the animations themselves; we test
  `isDayComplete()`.

### Shipped

All four "done when" conditions are met: every goal mutation confirms with a
haptic, the four animations work, the kill switch silences all of it from
`Profile.tsx` and survives a restart, and Reduce Motion is respected.

| Piece | Where |
| --- | --- |
| Haptics layer + kill switch | `lib/haptics.ts`, mirrored from `ThemeProvider`; the only importer of `expo-haptics` |
| Settings row | `Profile.tsx` for now — **E3 moves it** onto the "Notifications and feedback" screen |
| Day-close predicate | `lib/isDayComplete.ts`; an empty schedule is `false` |
| Day-close event | `lib/dayCompleteSignal.ts` — emitted by the tap, never derived from `progress === 1` |
| "Not on first paint" | `hooks/useOnValueChange.ts`, used by all four animations |
| Animated surfaces | `GoalList.tsx` (checkbox spring, `LinearTransition` rows), `ProgressRing.tsx` (`strokeDashoffset` + `pulseKey`), `DashboardHeader.tsx` |

Suite went from 23 suites / 122 tests to **27 / 169**, `tsc --noEmit` clean.
Animations are not tested, per the plan; `isDayComplete()`, `useOnValueChange`
and the signal module are, and were written test-first.

**Two things this stage hands forward.** `isDayComplete()` already has two
consumers, so E5's `buddy_done` SQL has to agree with it — `extract(isodow) - 1`
for the Monday = 0 convention. And the haptics toggle is sitting in the wrong
screen on purpose, waiting for E3 to build the right one.

**Not covered by any of this:** the E0 sign-off, which was still open when E1
landed — haptics don't fire in the simulator at all, and the four animations
were verified there rather than on a device. **Closed 2026-09-08**: the app runs
on a physical iPhone.

---

## E2 — Identity: one name, Sign in with Apple, account deletion (~4–5 days)

Scoped in full on 2026-09-08. **Three PRs, in this order: names, Apple,
deletion.** Each merges to `main` on its own before the next opens.

### What this stage found wrong in its own starting assumptions

Worth reading before the plan, because three of them were load-bearing:

- **"`profiles.full_name` is empty for everyone"** — false since at least
  2026-09-07. Both live users have a name. "Unknown nudged you" is a problem for
  the *next* person who signs up, not for the two accounts that exist.
- **Two name columns, no rule.** `full_name` and `nickname` both hold values,
  and they differ (`Piotr`/`Pietrell`, `Zofia`/`Burrito`). Your buddies see
  `full_name` via `useGroupMembers.tsx:52`; you see `nickname` via
  `Profile.tsx:37`. Nothing syncs them, and the push plan's server-side
  `coalesce` picks the opposite priority to `MemberTabs`.
- **Account deletion is not a consequence of social sign-in.** Apple requires
  in-app deletion of any app that lets people create accounts, so email sign-up
  already triggers it. It was parked in E6 on the wrong reasoning; it moves here.

Two facts about the database that shape the work:

- **`profiles` has no INSERT policy** (`initial_schema.sql:445` grants UPDATE
  only). The signup trigger `handle_new_user` creates the row. So the name
  screen **updates** that row; an upsert from the client is not the reliable
  path the push plan claims.
- **Nothing cascades from `profiles`.** `goals.user_id`, `group_members.user_id`,
  `logs.user_id` and `groups.creator_id` are all `NO ACTION`; only `logs → goals`
  cascades. A plain delete fails on a foreign key. PR 3 deletes in order itself.

### Why Apple and not Google

Email and password stay — the two existing accounts need them, and Apple-only
would close the door on Android permanently. Apple is added because typing an
email and password is where new users bounce.

Google is **deferred, possibly indefinitely**: three client IDs, an Android
signing fingerprint, a second native library, for one more button on an
iOS-first app. Note the direction of the App Store constraint — offering Google
*requires* Sign in with Apple, so doing Apple first costs nothing later; doing
Google first would have forced Apple anyway.

### PR 1 — One name column, asked once

**Migration.** Drop `nickname`. The values in it are discarded; `full_name` is
the single display name. `full_name` survives rather than `nickname` because the
signup trigger already writes it, every identity provider hands you that key,
and `useGroupMembers`, `MemberTabs` and `types/dashboardTypes.ts` already read
it — two files to change instead of five.

**The name screen.** A new screen in `(protected)`, gated on an empty name and
redirecting the way the group gate does (`useDashboardData.tsx:45-49`). A brand
new user has neither a name nor a group, so **the name gate has to win** — two
redirect effects racing is the failure mode to write carefully rather than
copy-paste. This is the same effect-driven pattern the React Compiler rules
already flag in `Dashboard.tsx` (E6), so don't add a seventh instance casually.

The screen is asked of **everyone**, email and Apple alike. That kills the
roadmap's worst trap before it exists: Apple hands over a name exactly once and
never again, and an app that never depends on that value cannot be hurt by a
user who hid it, reinstalled, or hit a network blip on the one pass. It also
means **`sign-up.tsx` is not touched** — the "Your name" field from
`push-notifications.md` Phase 1 is dead.

Empty field with a placeholder. **No skip and no prefilled random name**: most
people accept a prefill, which rebuilds "Unknown" under a friendlier label, and
a skip button puts the cost of a nameless user on the rest of their group.
Validation is trim, non-empty, a sane maximum — nothing else. Duplicate names
inside one group are allowed; a tiny crew of friends sorts that out in seconds,
and blocking it costs a server check, two error states and an ugly edge case on
joining.

**`hooks/useUpdateProfile.ts`** (new) — a hand-rolled `useMutation`, optimistic
over `queryKeys.profile(userId)`, rollback plus `Alert.alert`, modelled on
`useUpdateGroup.tsx`. **Not** through `lib/useOptimisticGoalMutation.ts`, which
hard-codes the `groupMembers` cache and "patch my own goals".

**Renaming** is in E2, not deferred — it is the only recovery path if a name is
ever wrong, and the profile screen is where it belongs. A modal, matching the
edit/delete modal idiom, rather than inline editing on a scrolling screen with a
keyboard in the way.

**Touched:** the migration, the new screen and its gate, `useUpdateProfile.ts`,
`useProfile.tsx:17`, `useProfileData.tsx:34`, `Profile.tsx:37`, the rename modal.
The `"Unknown"` fallback at `useGroupMembers.tsx:52` **stays** — one `||` against
a null nobody predicted beats a blank tab.

Tests first for the hook and the gate. The migration is SQL and gets none —
stated, not skipped quietly.

### PR 2 — Sign in with Apple

`expo-apple-authentication` → `identityToken` → `signInWithIdToken({ provider:
"apple", token })`. Needs a prebuild for the capability.

- **Email scope only.** Apple's name has nowhere to live now and would never be
  shown, so don't ask for it. Supabase still needs an address.
- **Button placement: below the form**, under an "or" divider, on the sign-in
  and sign-up screens. `welcome.tsx` is untouched. The cost is one extra tap for
  an Apple user, who must open a form screen to find the option that skips
  forms — accepted, because it is the layout people recognise.
- **`useAppleSignIn`, Apple-specific.** No shared `useOAuthSignIn`: the two
  flows only converge on the final `signInWithIdToken` line, and an abstraction
  built from one example is a guess about a provider that may never ship.
- **Tested**, unlike the animations, with `expo-apple-authentication` mocked in
  `jest.setup.js`. The nonce is why: Apple wants it SHA-256 hashed, Supabase
  wants the raw value, and swapping them produces a misleading `invalid nonce`
  that reads as a credentials problem. That is a pure function; pin it in a test
  rather than in a device build. The native handshake stays a device check.
- New Apple users land on PR 1's name screen like everyone else.

**Accepted, not solved: the same person can end up with two accounts.** Sign up
with email, later tap Continue with Apple and choose Hide My Email, and Supabase
sees a different address and makes a second account — new id, empty profile, no
group, a stranger to their own crew. Nobody can fix that from inside the app.
With two test users it is theoretical, and proper account linking is real work
before anyone has hit the problem. **Revisit when there are real users.** This
is the one known hole in E2.

### PR 3 — Delete my account

Moved out of E6, written last so it targets the post-migration schema.

`delete_my_account`, `SECURITY DEFINER` (the client cannot reach `auth.users`),
deleting in order because nothing cascades:

```
goals            → logs cascade with them
group_members
groups           → delete the group if they were its last member,
                   otherwise just null creator_id
profiles
auth.users
```

`creator_id` gives no real powers — it appears only in the "Create groups"
insert policy and in `"See my groups"` (`initial_schema.sql:437`, letting a
creator see a group they are not a member of). There is no owner role to
transfer. An **empty group is deleted rather than left behind**, because an
orphaned row keeps a working invite code pointing at a dead room.

**Hard delete, not anonymisation.** A "Former member" ghost tab that nobody can
nudge or remove is worse for the group than the person simply being gone. The
group's `current_streak` is a stored column and does not move when their logs
go.

Entry point on the profile screen, behind a **two-step alert** matching the
existing sign-out alert (`Profile.tsx:41`). Not a type-the-word-DELETE field —
that friction is for destroying something big and shared, and this is one
person's habit list — and not a single tap, on a screen that also has "Log out".

### Done when

Email and Apple sign-in both work on a physical device; every new account of
either kind is asked for a name and cannot get past it; the name shows the same
everywhere; renaming works and survives a restart; deleting an account removes
every trace and leaves no broken group behind.

---

## E3 — Push infrastructure (~3–4 days, needs E0)

Phases 0, 2, 3 and 7 from `todo/push-notifications.md`, unchanged: dependencies
and the config plugin, the schema migration (`device_push_tokens`,
`notification_prefs`, `notifications`, `goals.reminder_time`), token
registration and the settings screen, and token cleanup after
`DeviceNotRegistered`.

Three emphases that follow from this roadmap:

- **The iOS APNs key is already done** (E0, 2026-09-03). What remains on the
  credential side is the Android FCM v1 service-account JSON uploaded to EAS —
  do that before the first Android push test, not after.
- The stage ends with **verification on a physical device**, not on the
  simulator. The simulator stays the iteration loop for deep links (E4), but
  never the gate.
- The notification settings screen is the natural home for the haptics toggle
  from E1 — one "Notifications and feedback" screen, not two.

---

## E4 — Nudges (~3 days, needs E2 + E3)

Phase 4 from the push plan: the `send-nudge` Edge Function (shared-group
verification, rate limits of 3/day per person and 15/day in total, sanitization
to 140 characters, `dedupe_key`), `hooks/useSendNudge.ts`, `NudgeButton` plus
the swipe action plus `NudgeModal`, and routing from a notification tap.

This is the **core of the product** — the rest of push is scaffolding around it.
If the time budget runs out, this is the stage that has to land, and E5 can
wait.

One thing to think through before coding: what the *sender* sees. A nudge sent
into a void — no "delivered", no reaction from the recipient — stops getting
used quickly. Minimum version: a confirmation in the UI plus the `celebrate()`
haptic from E1. Full version: a one-tap reaction straight from the
notification. The full version is separate scope — do not bolt it onto E4.

---

## E5 — Reminders and social events (~3–4 days, needs E3)

Phases 5 and 6 from the push plan: `goals.reminder_time` threaded through five
files, `TimePicker`, a server-side `enqueue_due_reminders()` on `pg_cron`, the
dispatcher, and triggers on `logs` and `group_members`.

The link to E1: the "closed out their day" condition you extract into `lib/`
there is exactly the condition the `buddy_done` notification rests on. The
client and the SQL have to agree on the definition — in particular on the
`repeat_days` convention (Mon = 0), which in SQL reads `extract(isodow) - 1`.

---

## E6 — Polish and release (~2–3 days)

Concrete things found in the repo, not generalities:

- **A white splash in a dark app.** `app.json` has
  `splash.backgroundColor: "#ffffff"` and
  `adaptiveIcon.backgroundColor: "#ffffff"`, while `themeColors.background` is
  `#18181B`. Every app launch is a white flash. One line, the most visible
  effect in the whole stage.
- **The icons are still the template ones** (`assets/icon.png`,
  `adaptive-icon.png`, `splash-icon.png` — untouched since December). On top of
  that comes `notification-icon.png` (white on transparent), required by Android
  in E3.
- **The app name** — `"accountabilitybuddies"` as one word, which is how it will
  appear under the icon. Worth splitting `name` (visible) from `slug`
  (technical).
- ~~**The `delete_my_account` RPC** plus an entry point in the profile.~~ —
  **moved into E2** as its own PR, on 2026-09-08. It was listed here as a
  consequence of third-party sign-in, which is wrong: Apple requires in-app
  deletion of any app that lets people create accounts, so email sign-up
  already triggered it. Skipping Google would never have skipped this.
- **Empty states and network errors** — today errors are an `Alert.alert` from
  the mutation hook. Before the store, it is worth having a consistent
  "no connection" state on the dashboard.
- **`.env.example`** needs extending with the variables from E2/E3 (the Google
  client IDs, `EXPO_ACCESS_TOKEN`, `DISPATCH_SECRET` on the Supabase side).
- **Ten lint errors, eight of them new and worth reading.** The SDK 54 → 57
  upgrade (PR #31, 2026-09-05) brought eslint-config-expo 56, which turns on the
  React Compiler-era hook rules. They flag patterns that pre-date the upgrade
  and were simply never checked before:

  | Rule | Where |
  | --- | --- |
  | `react-hooks/set-state-in-effect` | `Dashboard.tsx:32` and `:63`, `EditGoalModal.tsx:41`, `GoalList.tsx:276`, `group-settings.tsx:34` and `:40` |
  | `react-hooks/immutability` | `__tests__/providers/supabaseProvider.test.tsx:53` |
  | `react-hooks/globals` | `__tests__/providers/themeProvider.test.tsx:86` |
  | `react/display-name` | `jest.setup.js:92` and `:93` — the only two that pre-date SDK 56 |

  All six `set-state-in-effect` hits are the same shape: seeding state from a
  prop or a query result in an effect, which is the pattern React's own docs
  argue against. **This is not cosmetic.** `experiments.reactCompiler` is `true`
  in `app.json`, so the compiler is already making assumptions about these
  components, and a rule that says "this effect causes a cascading render" is
  telling us where those assumptions are shakiest. The fix is usually deriving
  during render or resetting via `key`, not silencing the rule.

  Each one changes component behaviour, so each needs a test first — which is
  why it did not ride along with the SDK bump. Do it as its own pass, before
  E6's polish rather than during it, since `GoalList` and `Dashboard` are the
  two files every later stage keeps touching.

---

## Order, if something has to be cut

1. ~~**E0**~~ — closed, bar the device sign-off.
2. ~~**E1**~~ — **done 2026-09-04.**
3. **E2** — next, and fully scoped as of 2026-09-08: three PRs, names → Apple →
   deletion. **The names PR is the part that gates E4**, not the Apple one, so
   if the stage gets cut short it gets cut after PR 1.
4. **E3 + E4** — the heart of the product, but the most expensive and the most
   dependent.
5. **E5** — valuable, not critical for a first release.
6. **E6** — spread it across all the stages instead of leaving it to the end.

## Critical path

```
E0 (bundle ID) ──► Apple Developer ──► E3 ──┐
     │                    │                 ├──► E4 (nudges)
     │                    └──► E2 (Apple) ──┘
     └──► E1 (animations/haptics) — in parallel, no blockers
```

The left edge of this diagram is behind us. E0 closed on 2026-09-03 (bar the
device sign-off), the Apple account is active, the APNs key is created and
assigned, and **E1 landed on 2026-09-04** — the bottom branch is finished.

What remains is the top of the diagram, and its order is no longer free: E2 and
E3 can start in either order, but **E4 needs both**, and the cheapest thing that
unblocks it is E2's first PR, not the Apple one.

Note the correction, though — the old argument here was that
`profiles.full_name` is empty for everyone, so a nudge would read "Unknown
nudged you". That has not been true for a while: both live users have names, and
`useGroupMembers.tsx:52` only falls back to "Unknown" for an account that never
set one. So the names PR is not repairing today's users, it is closing the gap
for tomorrow's — still first, still about a day, but for the right reason.

Still outstanding on the credential side, and easy to forget now that iOS is
sorted: the **Android FCM v1 service-account JSON** has to be uploaded to EAS
before the first Android push test.
