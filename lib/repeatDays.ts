// `goals.repeat_days` stores day indexes as Monday = 0 ... Sunday = 6, which is
// the order the day picker writes them in. JS `Date#getDay()` is Sunday = 0, so
// anything comparing a goal against a real date has to go through
// `getTodayDayIndex()` rather than calling `getDay()` directly.

export const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type Repeatable = { repeat_days?: number[] | null };

export function toRepeatDayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function getTodayDayIndex(): number {
  return toRepeatDayIndex(new Date().getDay());
}

// An empty (or missing) `repeat_days` means "every day".
export function isScheduledOn(goal: Repeatable, dayIndex: number): boolean {
  const days = goal.repeat_days;
  if (!days || days.length === 0) return true;
  return days.includes(dayIndex);
}

export function filterGoalsForToday<T extends Repeatable>(goals: T[]): T[] {
  const today = getTodayDayIndex();
  return goals.filter((goal) => isScheduledOn(goal, today));
}

export function formatRepeatDays(days: number[] | null | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return "Every day";
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .filter(Boolean)
    .join(", ");
}
