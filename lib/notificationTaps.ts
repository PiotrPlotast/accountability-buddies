// Which notification taps have been handled, and the dashboard's "show a
// tab" and "open a cheer" signals. No `expo-notifications` here — that stays
// in `lib/push.ts`.

import type { CheerRequest } from "@/lib/cheer";

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

// A tapped buddy push also asks the dashboard to open a cheer. Unlike the tab
// signal it is kept when nobody is listening: on a cold start the tap can be
// routed before the dashboard has mounted, and a lost tab only means the
// wrong tab, while a lost cheer means the tap did nothing it promised. The
// first listener to subscribe takes it, once.
type CheerListener = (request: CheerRequest) => void;

const cheerListeners = new Set<CheerListener>();
let unheardCheer: CheerRequest | null = null;

export function onCheerRequest(listener: CheerListener): () => void {
  cheerListeners.add(listener);
  if (unheardCheer) {
    const request = unheardCheer;
    unheardCheer = null;
    listener(request);
  }
  return () => {
    cheerListeners.delete(listener);
  };
}

export function requestCheer(request: CheerRequest): void {
  if (cheerListeners.size === 0) {
    unheardCheer = request;
    return;
  }
  for (const listener of [...cheerListeners]) {
    try {
      listener(request);
    } catch {
      // One broken listener must not stop the others.
    }
  }
}
