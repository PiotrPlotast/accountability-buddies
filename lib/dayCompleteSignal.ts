import { useEffect, useState } from "react";

// „Zamknąłeś dzień" jako zdarzenie, nie jako stan.
//
// The ring lives in `DashboardHeader`, the tap that finishes the day happens in
// `useToggleGoal` — and deriving the pulse from `progress === 1` instead would
// fire it on a refetch, on a tab switch, and every time the app opens on a day
// already finished. Same trap as the third rule in `lib/haptics.ts`: a
// celebration nobody triggered is a ghost. So the toggle emits, and whoever is
// on screen reacts.
//
// Deliberately module-level rather than a context: it is fire-and-forget with
// no state to read back, and threading a provider through the tree for one
// pulse a day would be the more surprising choice.

type Listener = () => void;

const listeners = new Set<Listener>();

export function onDayComplete(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitDayComplete(): void {
  // Kopia, bo listener może się wypisać w trakcie iteracji.
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Jeden zepsuty słuchacz nie może zabrać animacji pozostałym.
    }
  }
}

// A counter rather than a boolean: two celebrations in a row have to be
// distinguishable, and `false → true → false` would need a reset nobody owns.
// Starts at 0 and only ever moves on a real emit, so first paint is settled.
export function useDayCompleteSignal(): number {
  const [count, setCount] = useState(0);

  useEffect(() => onDayComplete(() => setCount((c) => c + 1)), []);

  return count;
}
