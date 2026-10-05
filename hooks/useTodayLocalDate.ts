import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { getTodayLocalDate, msUntilNextLocalMidnight } from "@/lib/date";

// Today's local date (YYYY-MM-DD) that moves on by itself: a timer at the
// next local midnight while the app is open, and a re-read on every return
// to the foreground, since timers don't run while the app is suspended and
// the timezone may have changed meanwhile. Setting the same string bails
// out, so nothing re-renders unless the day actually changed.
export function useTodayLocalDate(): string {
  const [today, setToday] = useState(getTodayLocalDate);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const sync = () => {
      setToday(getTodayLocalDate());
      clearTimeout(timer);
      timer = setTimeout(sync, msUntilNextLocalMidnight());
    };

    timer = setTimeout(sync, msUntilNextLocalMidnight());
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return today;
}
