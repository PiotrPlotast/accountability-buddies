// Wall-clock times for habit reminders and quiet hours.
//
// The client works in `"HH:MM"`; Postgres `time` columns come back as
// `"HH:MM:SS"` and accept either. The value is a time in the owner's own
// timezone (`notification_prefs.timezone`), never an instant, so nothing here
// touches UTC.

export const DEFAULT_REMINDER_TIME = "09:00";
export const DEFAULT_QUIET_START = "22:00";
export const DEFAULT_QUIET_END = "07:00";

export function toHHMM(value: string | null | undefined): string | null {
  return value ? value.slice(0, 5) : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateToHHMM(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function hhmmToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// The phone's own 12h/24h style.
export function formatReminderTime(hhmm: string): string {
  return hhmmToDate(hhmm).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
