// en-CA locale yields YYYY-MM-DD, which matches the `date` column
// stored in the `logs` table and `last_streak_date` in `group_stats`.
export function getTodayLocalDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function getLocalDateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString("en-CA");
}

// Oldest first, ending on `endDate` (today by default) — the order the habit
// row's week strip draws in. `endDate` is YYYY-MM-DD, read as a local day.
export function getRecentLocalDates(
  count: number,
  endDate: string = getTodayLocalDate(),
): string[] {
  const [y, m, d] = endDate.split("-").map(Number);
  return Array.from({ length: count }, (_, i) =>
    new Date(y, m - 1, d - (count - 1 - i)).toLocaleDateString("en-CA"),
  );
}

// Milliseconds from `now` to the next local midnight. Built from the local
// calendar (not `+ 24h`) so DST days come out at their real length; at
// midnight itself it is a full day, never zero.
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
