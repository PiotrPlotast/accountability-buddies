# Roadmap — Accountability Buddies

Ties together five streams of work: push notifications, nudges, animations +
haptics, Google/Apple sign-in, and release polish. The details of push and
nudges live in `todo/push-notifications.md` — this document sets the **order and
the dependencies**, it does not repeat that plan.

## Starting state (verified 2026-09-01)

| Area | State |
| --- | --- |
| Tests | **green** — 23 suites, 122 tests, `tsc --noEmit` clean |
| Push | no infrastructure at all; the plan is ready in `todo/push-notifications.md` |
| Haptics | **1** call in the repo (`hooks/useToggleGoal.tsx`) |
| Animations | **1** file uses Reanimated (`GoalList.tsx`, swipe only) |
| Sign-in | email + password + OTP only (`useSignIn` / `useSignUp`) |
| Names | `profiles.full_name` is empty for everyone → the UI shows "Unknown" |
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
   14 merged branches deleted. Two remain, both deliberately:
   `refactor/switch-to-tanstack` (unmerged commit `e769d79 "test"`) and
   `worktree-fix+ui-ux-round-1` (an active worktree in `.claude/worktrees/`).
   The suite on `main` is green: 23 suites, 122 tests.
4. ~~**Fix CLAUDE.md**~~ — **done 2026-09-02.** The stale test baseline and the
   paragraph about the inline `heatmap` key were corrected; a paragraph was
   added explaining that `ios/`/`android/` are gitignored generated output and
   that the identifier only changes through `app.json` + `prebuild --clean`.

**Left in E0:** only the sign-off — a single `npm run ios` on a fresh prebuild,
to confirm the changed identifier installs cleanly on a device. All four items
are ticked off; nothing here blocks the later stages.

The first thing worth doing with the new account — before starting E3 at all —
is `eas credentials` → iOS → push key. Expo generates and uploads the APNs `.p8`
key for you, one key for the whole account, and it is the only iOS credential
push needs. Doing it now turns day one of E3 from "fighting with code signing"
into ordinary coding. The verification gate from `todo/push-notifications.md` —
a real `ExponentPushToken` from a physical iPhone and a test push from
https://expo.dev/notifications — is now reachable too, and it still applies
before any feature code gets written.

---

## E1 — Animations and haptics (~3–4 days, **does not need Apple**)

No backend, no credentials, immediate visual payoff. Now that the Apple account
is active this stage is no longer "work to do while waiting" but an ordinary
choice of ordering — still the cheapest and least risky one, but now competing
for time with E2/E3, which have just opened up.

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

**Done when:** every goal mutation has a haptic confirmation, the four
animations work, the kill switch works, and reduced-motion is respected.

---

## E2 — Identity: names + Google/Apple (~4–5 days, needs E0)

The order within the stage matters: **names before OAuth, OAuth before nudges.**

### Names (Phase 1 from `push-notifications.md`)

Without this, every nudge reads "Unknown nudged you". This is not a separate
feature — it is a precondition for E4 working at all. The scope is unchanged
from that plan: a "Your name" field in `sign-up.tsx`, a new
`hooks/useUpdateProfile.ts`, name editing in `Profile.tsx`, and a server-side
`coalesce()` as a safety net for existing accounts.

### Sign in with Apple

`expo-apple-authentication` → `identityToken` → `supabase.auth.signInWithIdToken({
provider: "apple", token })`. A native flow, not a web one — you have a dev
client, so nothing is in the way.

Three traps, each of which costs its own day if you fall into it:

- **Apple gives you the full name exactly once** — on the first authorization.
  On every subsequent sign-in the field is empty, *including after reinstalling
  the app*. The write to `profiles` has to happen in that one pass, because
  there is no second chance (recovering it means manually detaching the app in
  Apple ID settings). This is a place worth a comment in the code.
- **Nonce.** `expo-apple-authentication` takes the nonce already hashed
  (SHA-256), while Supabase verifies the raw one. Generate it once, pass the
  hash to Apple and the raw value to Supabase — confusing the two produces a
  misleading `invalid nonce`.
- **Private Relay.** A user can hide their email; you get an
  `@privaterelay.appleid.com` address. Anything that assumes "email = identity"
  (e.g. the `split_part(u.email,'@',1)` fallback from the push plan) has to
  survive that.

### Google

`@react-native-google-signin/google-signin` → `idToken` → the same
`signInWithIdToken`. You need a **Web client ID** (that is the one Supabase
verifies as the audience) plus iOS/Android client IDs. On Android there is also
the SHA-1 fingerprint of the signing key — with EAS builds you take it from
`eas credentials`, not from a local keystore.

### Product consequences

- **Store ordering:** if you offer Google sign-in, the App Store expects an
  equivalent private option — Sign in with Apple. We do Apple **before** Google
  so that a build breaking that condition never exists.
- **Same email, two methods.** Supabase links accounts by verified address by
  default, but Apple with Private Relay hands you a different address than the
  same person's password account — so **two accounts, two separate groups**.
  Decide now whether you accept that or add explicit account linking in the
  profile. For an app built around groups, the split is painful.
- **Account deletion.** Third-party sign-in in practice also drags in the
  requirement for a "delete account" path inside the app. Plan an RPC
  `delete_my_account` — it fits in E6.

**Done when:** all three sign-in methods work on a physical device, the name is
saved after each of them, and signing out and back in preserves the profile.

---

## E3 — Push infrastructure (~3–4 days, needs E0)

Phases 0, 2, 3 and 7 from `todo/push-notifications.md`, unchanged: dependencies
and the config plugin, the schema migration (`device_push_tokens`,
`notification_prefs`, `notifications`, `goals.reminder_time`), token
registration and the settings screen, and token cleanup after
`DeviceNotRegistered`.

Two emphases that follow from this roadmap:

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
- **The `delete_my_account` RPC** plus an entry point in the profile (see E2).
- **Empty states and network errors** — today errors are an `Alert.alert` from
  the mutation hook. Before the store, it is worth having a consistent
  "no connection" state on the dashboard.
- **`.env.example`** needs extending with the variables from E2/E3 (the Google
  client IDs, `EXPO_ACCESS_TOKEN`, `DISPATCH_SECRET` on the Supabase side).
- **The `fix/accessibility` branch** — check whether anything on it is still
  relevant before deleting it in E0.

---

## Order, if something has to be cut

1. **E0** — non-negotiable, blocks everything, and is cheap.
2. **E1** — the best effect-to-risk ratio, zero external dependencies.
3. **E2** — sign-in is the first screen; it also unblocks nudges.
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

As of 2026-09-03 the left edge of this diagram is behind us: E0 is closed and
the Apple account is active. In practice: create the APNs key through
`eas credentials` right away (a few minutes), then pick — E1 gives a fast effect
visible in the app, E2/E3 takes the longest stretch off the critical path.
Nothing forces the order any more.
