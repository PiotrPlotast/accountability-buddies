# Push Notifications for Accountability Buddies

## Context

The app has zero notification infrastructure today — no `expo-notifications`, no config plugin, no push-token storage, and the only grep hit for "notification" is `Haptics.NotificationFeedbackType`. That is the core gap in an accountability product: the whole premise is that your buddies keep you honest, but nothing reaches you once the app is closed. A habit you forgot is a habit you didn't do, and a buddy who slipped has no way of hearing about it.

This plan adds four notification types, ordered by how much they carry the product:

1. **Nudges** — you tap a buddy who hasn't finished today and send them a short custom message. This is the feature the product is actually about.
2. **Habit reminders** — per-habit reminder times, sent server-side so a habit you already completed does not nag you.
3. **Social events** — a buddy finished their day, someone joined the group.
4. (Enabling work) **display names**, without which every nudge reads "Unknown nudged you".

Delivery is Expo Push + Supabase Edge Functions, with `pg_cron` driving scheduled sends. Backend source moves into a committed `supabase/` directory, which the README already (wrongly) claims exists.

### Decisions already made

| Question | Answer |
| --- | --- |
| Types | Nudges (free-text), habit reminders, social events |
| Backend | Supabase Edge Functions + `pg_cron` |
| Nudge UI | Both a "Nudge" button *and* a swipe action on a buddy's habit rows |
| Names | Add real name capture as a prerequisite |
| Backend source | Install the Supabase CLI, commit `supabase/` — **done**, see Phase 0 |
| Platforms | iOS + Android, **iOS first** — Android deferred |
| Apple Developer Program | **Enrolling.** $99/yr is accepted as a cost of the feature, so it is a Phase 0 prerequisite, not a deferred gate |

### Build-tooling note

The project is **not** on Expo Go — `expo-dev-client@~6.0.20` is installed, `npm run ios/android` runs `expo run:*`, and prebuilt `ios/`/`android/` directories exist locally. That is already what push requires (Expo Go dropped remote push in SDK 53). The gap is credentials, not build tooling.

Two consequences: `ios/` and `android/` are **gitignored**, so adding a config plugin means re-running `npx expo prebuild --clean`; and the iOS Simulator covers *part* of push, not none of it — see below.

### Why enrollment is a prerequisite

Remote push to a physical iPhone requires the **Push Notifications capability** — the `aps-environment` entitlement — which requires a **paid Apple Developer Program membership ($99/yr)**. Free "personal team" provisioning cannot enable it, so a free-signed build never receives an APNs token and `getExpoPushTokenAsync()` fails. There is no workaround.

Since the membership is being bought, that stops being an architectural constraint and becomes a purchase order: **enrol first, then build against real delivery from day one.** This is strictly the better order — a push feature validated only against simulated payloads accumulates unverified assumptions (token shape, entitlement wiring, APNs error codes, background delivery) that all surface at once, late, when they are hardest to attribute.

**While enrollment is pending.** Approval is usually same-day but occasionally takes a couple of days, and there is useful work that does not need it: Phase 1 (display names) is pure app code, Phase 2 (schema) is pure SQL, and the Edge Functions of Phases 4–5 can be written and driven with a fictional token. Start there rather than idling. Note that a free-provisioned dev client expires after **7 days**, so don't invest in that build.

### The simulator loop (keep it, but it is not the gate)

Once enrolled, the physical device is the source of truth. The iOS Simulator remains worth wiring up as a **fast iteration loop** for one specific thing: deep-link routing. Re-triggering a nudge tap via the real path means a second account, a real send, and a phone in your hand; via the simulator it is one shell command with no network. That makes it the right tool for Phase 4's routing matrix (foreground / background / cold start / signed out) and a genuine regression test afterwards.

It also covers notification display, foreground-handler behaviour, `data` payload parsing, the settings UI and the permission-denied state. It cannot produce a device token or exercise any server hop, so **it never substitutes for the device gate below.**

Simulated remote pushes work in the Simulator since Xcode 11.4, either by dragging a `.apns` file onto the window or — cleaner, and scriptable — via CLI:

```bash
xcrun simctl push booted com.piotrplotast.accountabilitybuddies fixtures/push/nudge.apns
```

Passing the bundle ID as an argument means the file needs no `"Simulator Target Bundle"` key. This delivers through the normal `UNUserNotificationCenter` path, so `addNotificationReceivedListener` and `addNotificationResponseReceivedListener` both fire for real — which is precisely what Phase 4's deep linking needs. What it never produces is a device token.

Fixtures must mimic **Expo's** APNs shape, not a bare `aps` payload, or `data.type` routing won't see anything. Expo nests custom data under a top-level `body` key, which `expo-notifications` surfaces as `notification.request.content.data`:

```json
{
  "aps": {
    "alert": { "title": "Ada nudged you", "body": "what about your run?" },
    "sound": "default"
  },
  "body": { "type": "nudge", "groupId": "<uuid>", "senderId": "<uuid>" },
  "experienceId": "@<expo-username>/accountabilitybuddies"
}
```

`app.json` has no `owner` field, so substitute your actual Expo account username (`npx expo whoami`) — or drop `experienceId` entirely and see whether the payload still routes; recent `expo-notifications` versions do not always require it.

> Verify this mapping once rather than trusting it: log the whole `notification.request.content` object on first receipt and adjust the fixtures to match what actually lands. Getting the nesting wrong here produces a notification that displays correctly and routes nowhere, which is a confusing failure to debug later.

### The fictional-token harness

Separately useful, and the way to work while enrollment is pending: insert a syntactically valid but fictional token (`ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`) into `device_push_tokens` and exercise the dispatcher. Expo returns an error ticket (`DeviceNotRegistered`) rather than delivering — but the whole server path ran: cron fired, `enqueue_due_reminders()` selected the right rows, `dedupe_key` held, the batch POST went out, the receipt loop recorded the error.

Keep this after enrollment too. It is the only practical way to test Phase 7's `DeviceNotRegistered` cleanup, since the real alternative is uninstalling the app and waiting for a receipt.

One bonus once enrolled: iOS 16+ simulators on Apple Silicon can register for **real** APNs pushes, so the simulator loop and real delivery can converge. Still treat a physical device as the source of truth — background and lock-screen behaviour differ.

---

## Phase 0 — Build prerequisites

**Dependencies** (`npx expo install` to get SDK-54-matched versions):

```
expo-notifications expo-device @react-native-community/datetimepicker
npm i -D supabase
```

**`app.json`** — add to `plugins` (currently `["expo-router", ["expo-splash-screen", {…}], "expo-font"]`):

```json
["expo-notifications", {
  "icon": "./assets/notification-icon.png",
  "color": "#C6F94A",
  "defaultChannel": "default"
}]
```

The `icon` and `color` options are **Android-only** — iOS uses the app icon — so the white-on-transparent PNG is not on the critical path for an iOS-first build. Keep both options in now anyway so the deferred Android work needs no config change. `expo-constants` is already installed, so `Constants.expoConfig.extra.eas.projectId` (`176e6217-dbf7-4c0d-9174-d7d084a973ea`) is readable at runtime for `getExpoPushTokenAsync`.

Then `npx expo prebuild --clean && npm run ios`.

**iOS credentials** — do this first; everything else in this phase is cheap to redo, and this one has a queue:

1. Enrol in the Apple Developer Program ($99/yr). **Start the enrollment before writing any of this feature** — approval is usually same-day but can take a couple of days, and the useful non-blocked work is listed above.
2. `eas credentials` → iOS → push key. Expo generates and uploads an APNs `.p8` key for you; one key works across every app on the account, and it is the only iOS credential push needs.
3. Build to a real device: `eas build --profile development --platform ios` (or `npx expo run:ios --device` if you're signing locally). That profile is `"distribution": "internal"`, which on iOS means an Ad Hoc provisioning profile — another thing a free team cannot produce.

`eas.json`'s `ios-simulator` profile cannot receive a real push, but it *is* the build you use for the simulator loop — keep both builds around.

**Android credentials** — deferred. When you pick it up: add `"android": { "googleServicesFile": "./google-services.json", … }` to `app.json`, create a Firebase project, download `google-services.json` (gitignore it), and upload the FCM v1 service-account JSON via `eas credentials`. Nothing in Phases 1–7 changes.

**Supabase** — **already done since this plan was written.** `supabase` `^2.115.0` is a devDependency, `supabase/config.toml` exists, the project is linked (ref `rlvhncdzrfwjpohiqqfv`), and `supabase/migrations/` holds four migrations pulled from the live project. So skip the CLI setup and go straight to the extensions:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

Per CLAUDE.md, apply schema changes with `npx supabase db push` and re-sync dashboard-originated changes with `npx supabase db pull <name> --diff-engine migra` — the default `pg-delta` engine fails against this project's pooler. **Pull before writing the Phase 2 migration**, since some schema still originates in the dashboard and a stale local state will produce a migration that conflicts on push.

Set Edge Function secrets (`npx supabase secrets set`): `EXPO_ACCESS_TOKEN` (from expo.dev → Access Tokens; required once you enable Enhanced Security for Push Notifications, which you should) and `DISPATCH_SECRET` (a random string the cron job presents). `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are injected automatically.

**Verification gate**: before writing any feature code, get a real `ExponentPushToken` from a physical iPhone and send it a test push from https://expo.dev/notifications. **Do not proceed past this until it arrives.** If it does not, the problem is in the entitlement, the APNs key or the prebuild — all far easier to diagnose now than underneath four phases of feature code.

Land the simulator loop in the same sitting (`npm run push:sim`, see *Testing*), so Phase 4 has both the real path and the fast path available from the start.

---

## Phase 1 — Display names (prerequisite for nudges)

`app/(public)/sign-up.tsx` collects only email + password and never writes to `profiles`; the row is created by a dashboard trigger on `auth.users`. So `full_name` is NULL for everyone, `useGroupMembers` (`hooks/useGroupMembers.tsx:39`) falls back to `"Unknown"`, and `Profile.tsx` falls back to `"You"`. Nudges are unusable until this is fixed.

- **`app/(public)/sign-up.tsx`** — add a "Your name" `TextInput` above email, matching the existing accent-bordered input idiom from `app/(protected)/new-habit.tsx`. Pass it through as `signUp({ …, options: { data: { full_name } } })` so it lands in `raw_user_meta_data`, and update the dashboard's `handle_new_user` trigger to read it. **Also** write it explicitly from the client after `verifyOtp` succeeds — the trigger is invisible to this repo and may not be updatable in one pass; an explicit upsert is the reliable path.
- **`hooks/useUpdateProfile.ts`** (new) — hand-rolled `useMutation` over `profiles`, modeled on `hooks/useUpdateGroup.tsx` (the repo's only non-goal mutation). Optimistic over `queryKeys.profile(userId)`, rollback + `Alert.alert`. Do **not** route this through `lib/useOptimisticGoalMutation.ts` — that helper hard-codes the `groupMembers` cache and "patch my own goals".
- **`app/components/profile/Profile.tsx`** — make the display name editable. This is the app's first write to `profiles`.
- **Server-side fallback** — every notification body resolves the sender name as `coalesce(nullif(p.nickname,''), nullif(p.full_name,''), split_part(u.email,'@',1), 'Your buddy')`, so existing users are never "Unknown".

---

## Phase 2 — Schema (`supabase/migrations/<ts>_notifications.sql`)

Four objects. Full DDL goes in the migration; shape and rationale below.

**`device_push_tokens`** — one row per *device*, not a column on `profiles`. A column silently loses a token when someone signs in on a second device.

```
id uuid pk, user_id uuid → auth.users on delete cascade,
expo_push_token text not null unique,   -- unique: a device switching accounts moves the token
device_id text, platform text,
created_at timestamptz, last_seen_at timestamptz
```
RLS: users may select/insert/update/delete only their own rows. Sends read this table with the service role.

**`notification_prefs`** — per-account settings, unlike the accent color which is deliberately per-device.

```
user_id uuid pk → auth.users, timezone text not null default 'UTC',   -- IANA, written by the client
reminders_enabled bool default true, nudges_enabled bool default true, social_enabled bool default true,
quiet_start time, quiet_end time
```
RLS: own row only. Auto-created by a trigger on `auth.users`, and upserted by the client on first registration so existing users get one.

**`notifications`** — outbox, delivery log, and future in-app inbox in one table.

```
id uuid pk, recipient_id uuid, sender_id uuid null,   -- null = system
group_id uuid null, type text check (type in ('nudge','reminder','buddy_done','member_joined')),
title text, body text, data jsonb,
dedupe_key text unique,          -- 'reminder:<goal_id>:<local_date>' etc. The whole idempotency story.
status text default 'pending',   -- pending | sent | failed
ticket_id text, error text,
created_at timestamptz, sent_at timestamptz, read_at timestamptz
```
RLS: recipient may `select` and `update read_at`. **No client insert path** — inserts happen via `SECURITY DEFINER` functions and the service role only. `dedupe_key` doing the idempotency work as a unique constraint means a cron job that fires twice, or a retried Edge Function, cannot double-send.

Index: `(status, created_at) where status = 'pending'` for the dispatcher drain.

**`goals.reminder_time time null`** — nullable, meaning "no reminder".

### The `repeat_days` convention now reaches SQL

`goals.repeat_days` is Monday = 0 … Sunday = 6. Postgres `extract(dow)` is Sunday = 0 and `extract(isodow)` is Monday = 1, so **the correct conversion is `extract(isodow from ts)::int - 1`**. `lib/repeatDays.ts` is documented as the only place that knows the convention; it now has a second home in SQL. Add a comment in the migration pointing back at that file, and a line to CLAUDE.md's `repeat_days` section noting the SQL equivalent. Empty/absent `repeat_days` still means "every day".

---

## Phase 3 — Token registration and the settings screen

**`lib/push.ts`** (new) — `registerForPushNotificationsAsync()`: bail if `!Device.isDevice`; `getPermissionsAsync` → `requestPermissionsAsync` if undetermined; `Notifications.setNotificationChannelAsync("default", …)` guarded by `Platform.OS === "android"` (it is a no-op elsewhere, but the guard documents intent); `getExpoPushTokenAsync({ projectId })`. Returns `{ token, status }` so callers can distinguish "denied" from "failed".

Two iOS specifics:

- Request `ios: { allowAlert: true, allowBadge: true, allowSound: true }` explicitly. Consider `allowProvisional` — provisional authorization delivers quietly to Notification Centre with no permission prompt, which is a good fit for an accountability app where the first nudge *is* the pitch for enabling them properly. Skip it if you'd rather ask outright.
- **The `!Device.isDevice` bail shuts the simulator out of the fast loop.** Give it a dev escape hatch: when `__DEV__ && !Device.isDevice`, skip `getExpoPushTokenAsync` but still run the permission request and return a recognisable sentinel token (`ExponentPushToken[SIMULATOR]`). The registration effect, the `device_push_tokens` upsert, the settings screen and the permission-denied UI then all exercise without a phone, and the sentinel is obviously fake in the database. Never let this branch compile into a release build — and never read a green simulator run as evidence that registration works, since this branch is precisely the part that is faked.

**`app/_layout.tsx`** — add `Notifications.setNotificationHandler({…})` at module scope, alongside the existing `SplashScreen.preventAutoHideAsync()` calls. Choose `shouldShowBanner: true` so a nudge arriving while the app is foregrounded is still visible. This matters more on iOS than Android: without a handler iOS suppresses foreground notifications entirely, so a simulated push sent while the app is open appears to vanish — a false failure that is easy to misread in the simulator loop.

**`hooks/usePushRegistration.ts`** (new) — effect keyed on `session?.user.id`: register, then upsert `device_push_tokens` (on conflict `expo_push_token` → update `user_id`, `last_seen_at`) and upsert `notification_prefs` with `Intl.DateTimeFormat().resolvedOptions().timeZone`.

> Call this in **exactly one place**: `app/(protected)/_layout.tsx`. Every `useSupabase()` call site creates its own `getSession`/`onAuthStateChange` pair rather than sharing a context value, so mounting this hook twice registers twice. `(protected)/_layout.tsx` is also the right altitude — it only renders behind the session guard.

**Sign-out cleanup** — `hooks/useSupabase.ts`'s `signOut` currently does nothing but call `auth.signOut()`. Delete this device's `device_push_tokens` row *before* the sign-out (RLS needs the JWT), otherwise a signed-out device keeps receiving the previous user's pushes. This is the single easiest thing to get wrong in the whole feature.

**`app/(protected)/notification-settings.tsx`** (new route) — register in `app/(protected)/_layout.tsx` with `presentation: "modal"`, matching `new-habit` / `group-settings`. Contents:
- three toggles (reminders, nudges, social) over `hooks/useNotificationPrefs.ts`
- quiet hours start/end
- an OS-permission state row, with a "Open Settings" `Linking.openSettings()` action when permission is denied — without this, a user who tapped "Don't Allow" once has no route back and the feature looks broken
- move the sign-out action here from the Profile gear, and repoint that gear (`app/components/profile/Profile.tsx`) at this screen. The gear currently triggers sign-out, which is a mis-affordance regardless.

Reuse `group-settings.tsx`'s header bar (`‹` back + centered title) and its `text-text-muted font-mono uppercase text-xs tracking-widest` section headers verbatim.

**`app/components/settings/ToggleRow.tsx`** (new) — there is no Switch or shared Button anywhere in the codebase. RN `Switch` with `trackColor={{ true: accent.hex, false: "#3F3F46" }}`, following the convention that accent colors are inline styles, never classes. Keep it under `app/components/` — `tailwind.config.js` only globs `./app/**` and `./components/**`, so a component elsewhere generates no classes.

**`lib/queryKeys.ts`** — add `notificationPrefs: (userId) => ["notificationPrefs", userId]`. Use the proper key here rather than following the inline `["heatmap", userId]` precedent.

---

## Phase 4 — Nudges

**Delivery path**: the client calls the Edge Function directly with the user's JWT, so a nudge is instant. Reminders and social events go through the cron dispatcher, where a few minutes' latency is fine.

**`supabase/functions/send-nudge/index.ts`** — verifies the JWT, then with the service role:
1. sender and recipient share a group (`group_members`) — otherwise 403
2. recipient's `nudges_enabled` is true
3. rate limit from `notifications`: ≤ 3 per sender→recipient per day, ≤ 15 total per sender per day
4. sanitize the body — trim, collapse newlines, cap at **140 chars** server-side (the client cap is UX, not enforcement)
5. insert into `notifications` with `dedupe_key = 'nudge:<sender>:<recipient>:<epoch-minute>'`, which also swallows double-taps
6. POST to `https://exp.host/--/api/v2/push/send` (batches of 100, `Authorization: Bearer $EXPO_ACCESS_TOKEN`), record ticket ids, mark `sent`

Returns `{ success: boolean, message: string }` — matching the existing `join_group_via_code` convention that `join-group.tsx` already reads. Never leak *which* check failed for a recipient-side rejection; "Couldn't deliver that nudge" is enough.

**`hooks/useSendNudge.ts`** (new) — `useMutation` over `supabase.functions.invoke("send-nudge", { body })`. Not through `useOptimisticGoalMutation` — nothing about a nudge is goal-shaped. Success haptic via `expo-haptics` to match `useToggleGoal`.

**UI — both affordances:**

- **`app/components/dashboard/NudgeButton.tsx`** — rendered in `Dashboard.tsx` where `AddGoalInput` renders for yourself: `{isViewingMe ? <AddGoalInput /> : <NudgeButton member={currentMember} />}`. Symmetric with the existing layout and discoverable.
- **Per-habit swipe** in `app/components/dashboard/GoalList.tsx` — the `Swipeable` passes `undefined` for both action renderers when `!isViewingMe`, so both directions are free on exactly the screens where nudging applies. Add a right action mirroring the existing `RightActionComponent`, prefilling the compose modal with the habit title ("Ada, what about your run?"). Leave the row `Pressable` disabled as it is.
- **`app/components/dashboard/NudgeModal.tsx`** — transparent centered modal modeled on `DeleteGoalModal.tsx`. `TextInput` with `maxLength={140}` and a live counter, 3–4 tappable preset messages, Send/Cancel.

**Modal sequencing**: `NudgeModal` is opened from the dashboard body, not from the pageSheet habit manager, so it does not need the `pendingAction` queue. But it is a fourth sibling in the same modal cluster — if it ever becomes reachable from `HabitsManagerModal`, extend the `PendingAction` union rather than reintroducing a `setTimeout`, per the rule in `Dashboard.tsx:43-64`.

**Deep linking** — `hooks/useNotificationResponse.ts` (new), mounted in `app/(protected)/_layout.tsx`. Combine `useLastNotificationResponse()` (cold start) with `addNotificationResponseReceivedListener` (warm). Route from `data.type`. **Never navigate across the `Stack.Protected` boundary**: if a notification is tapped with no session, stash the target and replay it once `session` becomes truthy.

---

## Phase 5 — Habit reminders

**Client — `goals.reminder_time` through the existing data path.** The value has to be threaded through five files or it silently drops:

1. `types/dashboardTypes.ts` — add to `Goal` (and `GoalRow`, though it is currently dead code)
2. `hooks/useAddGoal.tsx` — `AddGoalParams`, the `.insert()` payload, **and the optimistic `getPatch` literal**, which builds a full `Goal` by hand
3. `hooks/useEditGoal.tsx` — `EditGoalParams`, `GoalEdits`, `buildEdits()`; follow the existing `if (x !== undefined)` idiom so a title-only edit doesn't clobber it
4. `hooks/useDashboardActions.tsx` — the `addGoal`/`editGoal` option objects
5. Both forms: `app/(protected)/new-habit.tsx` and `app/components/dashboard/EditGoalModal.tsx`

**`app/components/habits/TimePicker.tsx`** (new) — same prop shape as its neighbors: `{ value: string | null; onChange: (hhmm: string | null) => void }`. Wraps `@react-native-community/datetimepicker` with an "Off" state. Insert in both forms as a fourth `mt-8 mb-3` section after `<DayPicker />`; `new-habit.tsx` already has `paddingBottom: 120` clearing the pinned save button, so no layout change.

**Server — `enqueue_due_reminders()`**, a SQL function run by `pg_cron` every 5 minutes. For each goal with a `reminder_time`, joined to its owner's `notification_prefs`:

```sql
-- local wall-clock now, in the user's own timezone
with u as (select …, (now() at time zone p.timezone) as local_now …)
where p.reminders_enabled
  and local_now::time >= g.reminder_time
  and local_now::time <  g.reminder_time + interval '5 minutes'
  and (extract(isodow from local_now)::int - 1) = any(
        coalesce(nullif(g.repeat_days, '{}'), array[0,1,2,3,4,5,6]))
  and not exists (select 1 from logs l          -- the point of doing this server-side
                  where l.goal_id = g.id and l.date = local_now::date)
  and not (p.quiet_start is not null and local_now::time between p.quiet_start and p.quiet_end)
insert into notifications (…, dedupe_key)
values (…, 'reminder:' || g.id || ':' || local_now::date)
on conflict (dedupe_key) do nothing;
```

That `not exists` against `logs` is the entire reason reminders are server-side. A local `expo-notifications` schedule cannot know you already ticked the habit off, so it nags you anyway — which is precisely the behavior that makes people disable notifications.

**`supabase/functions/dispatch-notifications/index.ts`** — checks the `DISPATCH_SECRET` header, calls `enqueue_due_reminders()`, drains `status = 'pending'` in batches of 100 to the Expo Push API, and writes back `ticket_id` / `status` / `error`.

**Cron** (`cron.schedule`, `*/5 * * * *`) → `net.http_post` to the dispatcher with the secret header.

---

## Phase 6 — Social events

Enqueued by DB triggers as pure SQL inserts (no `pg_net`), delivered by the same 5-minute dispatcher.

- **Buddy finished their day** — `after insert on logs`. Fire **only** when this log completes the user's last habit scheduled for today, not on every completion. Five habits must not mean five pushes, and gating on "all done" avoids needing any coalescing logic. `dedupe_key = 'buddy_done:<user>:<date>:<recipient>'`.
- **Someone joined** — `after insert on group_members`, notify existing members.
- Both respect `social_enabled` and quiet hours, and never notify the actor about their own action.

*Streak-broken* notifications are deliberately deferred: `groups.current_streak` / `last_streak_date` are maintained by dashboard-side logic this repo cannot see, so the trigger point is unknown. Inspect that logic before scoping it.

---

## Phase 7 — Receipts and token hygiene

The step everyone skips, and then sends vanish silently. A second cron job (every 30 min) POSTs stored `ticket_id`s to `https://exp.host/--/api/v2/push/getReceipts`, records errors on `notifications`, and **deletes `device_push_tokens` rows whose receipt returns `DeviceNotRegistered`** — the standard signal that an app was uninstalled. Without this, dead tokens accumulate forever and Expo eventually rate-limits you.

Use the fictional-token harness to test this: it returns exactly `DeviceNotRegistered`, which is otherwise only reachable by uninstalling the app and waiting. **Distinguish it from `InvalidCredentials`**, which means the APNs key is misconfigured rather than a device going away — treating the two alike would delete every live token the first time a key expires. That is the failure mode this phase exists to prevent, so do not collapse the branches.

---

## Testing

**`jest.setup.js`** — add mocks alongside the existing `expo-haptics`/`expo-clipboard`/`expo-router` block, per CLAUDE.md's instruction to centralize them:

- `expo-notifications`: `getPermissionsAsync`, `requestPermissionsAsync`, `getExpoPushTokenAsync`, `setNotificationHandler`, `setNotificationChannelAsync`, `useLastNotificationResponse` (→ `null`), `addNotificationResponseReceivedListener` (→ `{ remove: jest.fn() }`)
- `expo-device`: `{ isDevice: true }` — keep this `true` so unit tests exercise the real registration path, not the simulator escape hatch. Add one test that flips it to `false` to cover the sentinel branch.
- `@react-native-community/datetimepicker`

Without these, every suite that renders a screen breaks.

**New unit tests** — `buildFakeSupabase` needs a `functions: { invoke }` stub added to `__tests__/test-utils/render.tsx`:

- `usePushRegistration` — upsert payload; no-op with no session; no-op when permission denied; token deleted on sign-out
- `useSendNudge` — invoke args; error surfaces an `Alert`
- `useNotificationPrefs` — toggle writes and optimistic rollback
- `NudgeModal` — 140-char cap, Send disabled when empty, presets fill the input
- `TimePicker` + the `reminder_time` round-trip through `useAddGoal`/`useEditGoal` (mirroring the existing `habitPickers.test.tsx`)
- `lib/repeatDays.ts` — if a `toIsoDowIndex` helper is added, extend `__tests__/lib/repeatDays.test.ts`

**Run tests as**:
```bash
npx jest --forceExit
```
`--forceExit` because Jest hangs after any suite that renders React.

**Baseline**: the suite is **green** — 23 suites, 122 tests, `npx tsc --noEmit` clean (2026-09-01). A failure here is a real regression from this work.

**Simulator fixtures** — commit a `fixtures/push/` directory with one `.apns` file per notification type (`nudge`, `reminder`, `buddy_done`, `member_joined`), each in the Expo payload shape shown in *Testing tiers*. Add a script so this is one command rather than a remembered incantation:

```json
"push:sim": "xcrun simctl push booted com.piotrplotast.accountabilitybuddies"
```

used as `npm run push:sim -- fixtures/push/nudge.apns`. These fixtures are the regression test for deep linking, and they keep working after enrollment.

**SQL** has no in-repo test harness. Verify `enqueue_due_reminders()` by hand in the SQL editor with a seeded goal whose `reminder_time` is a minute out, asserting: it enqueues once, does not re-enqueue on a second call (the `dedupe_key` constraint), and enqueues nothing once a matching `logs` row exists.

## End-to-end verification

Physical iPhone, dev client, real APNs key. The simulator steps are marked — run those in the fast loop while iterating, but every one of them must also pass on the device before the feature is done.

1. Sign in → confirm a `device_push_tokens` row appears with the right `user_id` and a **real** `ExponentPushToken`, not the `[SIMULATOR]` sentinel.
2. Test push from https://expo.dev/notifications. **Do not proceed past this until it arrives.**
3. Second account in the same group → send a nudge → it arrives with the sender's real name; tapping it opens the dashboard on the sender's tab.
4. *(also simulator)* Routing matrix for that tap: app **foregrounded** (proves `setNotificationHandler`), **backgrounded**, **cold-started** (proves `useLastNotificationResponse()` replays it), and **signed out** — the target is stashed and replayed after sign-in, never navigating across the `Stack.Protected` boundary.
5. Send four nudges rapidly → the fourth is rejected by the rate limit with a friendly message.
6. Set a habit reminder two minutes out → wait for the cron tick → it arrives. Complete the habit first and repeat → **no reminder arrives.** This is the check that proves the server-side design was worth it.
7. Call the dispatcher twice in the same window → the `dedupe_key` constraint means still exactly one send.
8. Toggle each preference off, and set quiet hours over the current time → confirm the corresponding push stops.
9. *(also simulator)* Deny OS permission → the settings screen shows the denied state and "Open Settings" works.
10. Sign out → confirm the token row is deleted and pushes stop arriving.
11. Lock the phone and send a nudge → confirm lock-screen delivery and sound. **Device-only** — the simulator does not meaningfully model this, and it is how the feature will actually be experienced.
12. Fictional-token harness → run the receipt job → that row is deleted from `device_push_tokens`, and a simulated `InvalidCredentials` does *not* delete anything.

## Documentation

Update `CLAUDE.md` with: the notifications architecture and where sends originate; the `isodow - 1` SQL equivalent in the `repeat_days` section; the new `supabase/` directory and deploy commands; the fact that `signOut` now has token cleanup; and the simulator push workflow (`npm run push:sim`, the `fixtures/push/` payload shape, and the `__DEV__` sentinel-token branch in `lib/push.ts` — all three are non-obvious and will otherwise be rediscovered the hard way). Fix the README's stale `supabase/migrations/` claim, which this work finally makes true.
