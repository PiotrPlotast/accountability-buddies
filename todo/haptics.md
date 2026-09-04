# Haptics — E1, first half

The haptics half of **E1** in `todo/roadmap.md`. Animations are explicitly out of
scope here; the only thing this plan borrows from the animation list is
`isDayComplete()`, because `celebrate()` needs a trigger and that predicate is
also what E5's `buddy_done` notification will rest on.

Nothing here needs Apple, a backend change, or a migration. It is all client
code plus one AsyncStorage key.

## Scope

**In:** `lib/haptics.ts`, the `hapticsEnabled` kill switch (context + storage +
a row in `Profile.tsx`), every goal mutation, the three pickers/tab strip,
`onError` in the shared mutation hook, and `lib/isDayComplete.ts`.

**Out:** the four animations, `useReducedMotion()` (it governs motion, not
haptics), and the "Notifications and feedback" settings screen — E3 builds that
and moves the toggle onto it.

## The API

`lib/haptics.ts` is the only file in the repo that imports `expo-haptics`.
Names come from the domain, not from the API:

| Function | Maps to | Fires when |
| --- | --- | --- |
| `tapLight()` | `ImpactFeedbackStyle.Light` | any tap in a list, a tab, a picker tile |
| `toggleDone()` | `NotificationFeedbackType.Success` | ticking off a habit |
| `toggleUndone()` | `ImpactFeedbackStyle.Light` | undoing that tick |
| `destructive()` | `NotificationFeedbackType.Warning` | deleting a habit |
| `celebrate()` | 3 pulses, ~90 ms apart | the last scheduled habit of the day lands |
| `error()` | `NotificationFeedbackType.Error` | a mutation rolls back |

Three rules, written into the file as a comment because each of them is a bug
waiting to be reintroduced:

- **One kill switch.** Every function returns early on a module-level
  `enabled` flag. Call sites never read it, never branch on it, and never learn
  it exists.
- **Never `await`.** A haptic must not delay an optimistic update. The
  functions return `void`, not a promise, and swallow rejections — an unplugged
  Taptic Engine is not an app error.
- **Never vibrate in response to server data.** A vibration confirms *the
  user's touch*. This is why `celebrate()` fires from the toggle path rather
  than from an effect watching the cache: a refetch that flips
  `completed_today` must stay silent.

## The kill switch

`hapticsEnabled` is a per-device preference, exactly like the accent — same
provider, same storage, new key `theme.haptics.v1`, default `true`.

`lib/haptics.ts` is a plain module and cannot call a hook, so the flag is
mirrored rather than read:

```
ThemeProvider  ──hydrate──►  setHapticsEnabled(stored)  ──►  module flag
     ▲                                                          │
     └── toggle ──► AsyncStorage + setHapticsEnabled(next) ──────┘
```

`ThemeContextValue` gains `hapticsEnabled: boolean` and
`setHapticsEnabled: (on: boolean) => void`; the provider imports the module
setter as `syncHapticsEnabled` so the two names don't collide. The context copy
exists only so `Profile.tsx` can render a switch — no other component reads it.

A failed AsyncStorage read means the default (`true`), never a stuck splash —
the existing accent read already works this way, and `hydrated` keeps covering
both.

**UI:** a row in `Profile.tsx` next to the accent picker, using RN's `Switch`
tinted with `accent.hex`. E3 relocates it; until then it is the only way to
exercise the flag by hand.

## `isDayComplete()`

```ts
// lib/isDayComplete.ts
isDayComplete(goals: Goal[]): boolean
```

True when the goals scheduled for today (via `filterGoalsForToday`, so the
Monday = 0 convention stays in `lib/repeatDays.ts`) are non-empty and all
`completed_today`. **An empty schedule is `false`** — a day with nothing due was
never closed out, and a user with no habits should not get a fanfare for
existing. E5's SQL has to agree with this, `extract(isodow) - 1` included.

`useToggleGoal` decides between `toggleDone()` and `celebrate()` *before* the
optimistic patch, by projecting the toggle onto the cached list:

```
goal.completed_today ? toggleUndone()
                     : isDayComplete(projected) ? celebrate() : toggleDone()
```

`projected` is the current user's goals from
`queryKeys.groupMembers(goal.group_id)` with this one flipped to `true`. Reading
the cache here is not "reacting to server data" — the read is caused by the tap,
and no cache change can trigger it.

## Call-site map

| File | Call | Hook point |
| --- | --- | --- |
| `hooks/useToggleGoal.tsx` | `toggleDone` / `toggleUndone` / `celebrate` | `beforeOptimistic` (already there — moves onto the layer) |
| `hooks/useAddGoal.tsx` | `tapLight` | `beforeOptimistic` |
| `hooks/useEditGoal.tsx` | `tapLight` | `beforeOptimistic` |
| `hooks/useDeleteGoal.tsx` | `destructive` | `beforeOptimistic` |
| `lib/useOptimisticGoalMutation.ts` | `error` | `onError`, beside the `Alert.alert` |
| `app/components/dashboard/MemberTabs.tsx` | `tapLight` | `onPress` |
| `app/components/habits/DayPicker.tsx` | `tapLight` | `onPress` — **only when the toggle is accepted**, not on the refused last-chip tap |
| `app/components/habits/IconPicker.tsx` | `tapLight` | `onPress` |

Creating and editing get `tapLight()`, not `Success` — `Success` is reserved for
ticking off, or the one gesture that should feel distinct stops being distinct.

## Tests (written first, in this order)

`jest.setup.js` already mocks `expo-haptics`, but the mock is missing
`NotificationFeedbackType.Warning` and `.Error` — **extend it before anything
else**, or `destructive()` and `error()` silently fire `undefined`.

1. `__tests__/lib/isDayComplete.test.ts` — all done → true; one outstanding →
   false; an unscheduled-today goal left undone → still true; empty list →
   false; a goal with no `repeat_days` counted as due.
2. `__tests__/lib/haptics.test.ts` — each function calls the right
   `expo-haptics` API; every function is a no-op after
   `setHapticsEnabled(false)` and fires again after `(true)`; `celebrate()`
   fires three pulses (fake timers); a rejecting `expo-haptics` doesn't throw.
3. `__tests__/hooks/useToggleGoal.test.tsx` — extend: ticking calls
   `toggleDone`, untick calls `toggleUndone`, the last habit of the day calls
   `celebrate` and *not* `toggleDone`.
4. `__tests__/hooks/useDeleteGoal.test.tsx` — extend: `destructive` on mutate,
   `error` on rollback.
5. `__tests__/providers/themeProvider.test.tsx` — extend: hydration pushes the
   stored flag into the module; toggling writes storage and the module; a
   rejected read leaves haptics enabled.
6. `__tests__/components/habitPickers.test.tsx` / `MemberTabs.test.tsx` —
   extend: a tap calls `tapLight`; DayPicker's refused last-chip tap does not.

Animations are not tested (per the roadmap); `isDayComplete()` is the shape that
carries the behaviour, and it is pure.

## Order of work

1. Extend the `expo-haptics` mock in `jest.setup.js`.
2. `isDayComplete()` — test, then implement.
3. `lib/haptics.ts` — test, then implement.
4. Kill switch through `ThemeProvider` + context — test, then implement.
5. Move `useToggleGoal` onto the layer, add `celebrate()`.
6. The remaining mutations and `onError`.
7. The three components.
8. The `Profile.tsx` switch (styling/copy — no test, per CLAUDE.md).
9. `npm test`, `npx tsc --noEmit`, `npm run lint`.

## Done when

Every goal mutation confirms with a haptic, closing out the day feels different
from an ordinary tick, the kill switch silences all of it from `Profile.tsx` and
survives a restart, and the baseline is green again with the new suites on top
of it.
