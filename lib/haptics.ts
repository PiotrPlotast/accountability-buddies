import * as Haptics from "expo-haptics";

// The only file in the app that imports `expo-haptics`. Names come from the
// domain, not from the API, so a call site reads as what it means rather than
// as which enum member it happens to use.
//
// Three rules, each of them a bug that gets reintroduced the moment it stops
// being written down:
//
// 1. ONE KILL SWITCH. Every function returns early on `enabled` below.
//    Call sites never read the flag, never branch on it, and never learn it
//    exists — `ThemeProvider` pushes it in through `setHapticsEnabled`.
// 2. NEVER AWAIT. A buzz must not delay an optimistic update, so everything
//    returns `void` and swallows its own failure. A phone with no Taptic
//    Engine, or one in low-power mode, is not an app error.
// 3. NEVER VIBRATE IN RESPONSE TO SERVER DATA. A vibration confirms *the
//    user's touch*. A cache refresh that buzzes is a ghost in the phone —
//    which is why `celebrate()` is called from the toggle path and not from
//    an effect watching the query cache.

let enabled = true;

// Mirrors `hapticsEnabled` from the theme context. A plain module can't call a
// hook, so the provider syncs the value here on hydration and on every toggle.
export function setHapticsEnabled(next: boolean): void {
  enabled = next;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

// Rule 2 lives here and nowhere else: one place that fires and forgets, so no
// call site has to remember the `.catch`. The synchronous `try` covers a native
// module that throws instead of rejecting.
function fire(run: () => Promise<void>): void {
  if (!enabled) return;
  try {
    run().catch(() => {});
  } catch {
    // Ignored — see rule 2.
  }
}

// Any tap in a list, a tab, or a picker tile.
export function tapLight(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

// Ticking off a habit. The one gesture that gets `Success`, so it stays
// distinguishable from every other confirmation in the app.
export function toggleDone(): void {
  fire(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

// Undoing that tick — quieter than doing it, deliberately.
export function toggleUndone(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

// Deleting a habit.
export function destructive(): void {
  fire(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  );
}

// A mutation rolled back — paired with the `Alert.alert` in
// `useOptimisticGoalMutation`.
export function error(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

// Odstęp na tyle krótki, żeby trzy pulsy czytały się jako jeden gest, a nie
// jako trzy osobne powiadomienia.
const CELEBRATE_GAP_MS = 90;
const CELEBRATE_PULSES = 3;

// Closing out the day: the last habit scheduled for today has just landed.
// A sequence, because a single buzz here is indistinguishable from an ordinary
// tick — and this is the one moment in the app worth a fanfare.
export function celebrate(): void {
  if (!enabled) return;

  for (let i = 0; i < CELEBRATE_PULSES; i++) {
    if (i === 0) {
      toggleDone();
      continue;
    }
    // The flag is re-read inside the timeout on purpose: a user who switches
    // haptics off mid-sequence should not feel the rest of it.
    setTimeout(() => toggleDone(), i * CELEBRATE_GAP_MS);
  }
}
