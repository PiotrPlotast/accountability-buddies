import { useEffect, useRef } from "react";

// Uruchamia efekt dopiero przy *zmianie* wartości — nigdy przy montowaniu.
//
// Dashboard opens, a tab switches, a query refetches: React remounts or
// re-renders and every naive `useEffect` fires again. For an animation that
// means the ring sweeps up from zero every time you glance at the app, and the
// checkbox springs for habits you ticked hours ago. The user did nothing, so
// nothing should move — the same principle the haptics layer follows in
// `lib/haptics.ts`.
export function useOnValueChange<T>(
  value: T,
  effect: (current: T, previous: T) => void,
): void {
  const previous = useRef(value);
  // Trzymamy najnowszy callback w refie, żeby nie był zależnością efektu —
  // inaczej inline'owa strzałka (czyli każde wywołanie) odpalałaby go co render.
  const latest = useRef(effect);

  useEffect(() => {
    latest.current = effect;
  });

  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    const before = previous.current;
    previous.current = value;
    latest.current(value, before);
  }, [value]);
}
