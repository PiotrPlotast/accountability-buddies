import { Goal } from "@/types/dashboardTypes";
import { getRecentLocalDates, getTodayLocalDate } from "@/lib/date";
import { isScheduledOn, toRepeatDayIndex } from "@/lib/repeatDays";

// How far back `useGroupMembers` fetches logs, and how many cells the habit
// row's week strip draws. Changing this changes both.
export const HISTORY_DAYS = 7;

export type HistoryState = "done" | "missed" | "off";

export type HistoryCell = {
  date: string;
  state: HistoryState;
};

/**
 * The trailing `HISTORY_DAYS` for one habit, oldest first.
 *
 * `off` means the habit wasn't scheduled that weekday, which is not a miss —
 * the strip greys those out rather than showing them as failures. Days after
 * today can't occur here because the window ends on today.
 */
export function getGoalHistory(goal: Goal): HistoryCell[] {
  const done = new Set(goal.completed_dates ?? []);
  const today = getTodayLocalDate();

  return getRecentLocalDates(HISTORY_DAYS).map((date) => {
    if (done.has(date)) return { date, state: "done" as const };

    // `date` is YYYY-MM-DD; parsing it as local midnight keeps the weekday
    // aligned with how the date string was generated in the first place.
    const [y, m, d] = date.split("-").map(Number);
    const dayIndex = toRepeatDayIndex(new Date(y, m - 1, d).getDay());

    if (!isScheduledOn(goal, dayIndex)) return { date, state: "off" as const };
    // Today isn't a miss yet — the day isn't over.
    if (date === today) return { date, state: "off" as const };

    return { date, state: "missed" as const };
  });
}

/** Consecutive scheduled days completed, counting back from today. */
export function getCurrentStreak(goal: Goal): number {
  const cells = getGoalHistory(goal);
  let streak = 0;

  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].state === "done") streak++;
    else if (cells[i].state === "missed") break;
    // `off` days neither extend nor break the streak.
  }

  return streak;
}
