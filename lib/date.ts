// en-CA locale yields YYYY-MM-DD, which matches the `date` column
// stored in the `logs` table and `last_streak_date` in `group_stats`.
export function getTodayLocalDate(): string {
  return new Date().toLocaleDateString("en-CA");
}
