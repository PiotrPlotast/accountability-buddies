// Which notification taps have been handled, and the dashboard's "show a
// tab" signal. No `expo-notifications` here — that stays in `lib/push.ts`.

// Module scope, for the life of the JS runtime: the protected layout remounts
// on every sign-in, and the launch tap is still readable then, so a flag in
// the hook would route the same tap again.
const claimed = new Set<string>();

/** True the first time a tap id is seen, false every time after. */
export function claimTap(id: string): boolean {
  if (claimed.has(id)) return false;
  claimed.add(id);
  return true;
}

// An event, not a route param, for the same reason the day-close pulse is
// one (`lib/dayCompleteSignal.ts`): the dashboard reacts to a tap, it doesn't
// derive a state that a re-render could fire again.
// `null` is your own tab; anything else is the member to show.
type Listener = (memberId: string | null) => void;

const listeners = new Set<Listener>();

export function onShowTab(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitShowTab(memberId: string | null): void {
  for (const listener of [...listeners]) {
    try {
      listener(memberId);
    } catch {
      // One broken listener must not stop the others.
    }
  }
}
