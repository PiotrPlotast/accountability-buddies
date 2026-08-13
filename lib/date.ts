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

// Oldest first, ending on today — the order the habit row's week strip draws in.
export function getRecentLocalDates(count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    getLocalDateDaysAgo(count - 1 - i),
  );
}
