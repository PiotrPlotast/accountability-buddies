import {
  DAY_FULL_NAMES,
  daysUntilNextScheduled,
  isScheduledOn,
} from "@/lib/repeatDays";

// The dashboard lists only the habits due today, so a habit saved for other
// days drops off it and the save looks like it did nothing. This is the line
// that says where it went.

type SavedHabit = {
  title: string;
  /** The schedule as saved, Monday = 0. Empty means every day. */
  days: number[];
  /** The schedule before an edit; absent for a new habit. */
  previousDays?: number[];
  /** Today's index on the same scale, `getTodayDayIndex()`. */
  today: number;
};

/**
 * The notice for a save, or `null` when nothing left today's list: a new
 * habit that is due today, or an edit that didn't take today away (one that
 * was already off today wasn't on the list to begin with).
 */
export function habitSavedNotice({
  title,
  days,
  previousDays,
  today,
}: SavedHabit): string | null {
  const saved = { repeat_days: days };
  if (isScheduledOn(saved, today)) return null;

  const isEdit = previousDays !== undefined;
  if (isEdit && !isScheduledOn({ repeat_days: previousDays }, today)) {
    return null;
  }

  const ahead = daysUntilNextScheduled(saved, today);
  const next = ahead === 1 ? "tomorrow" : DAY_FULL_NAMES[(today + ahead) % 7];
  return isEdit
    ? `${title} is off today. Next up ${next}.`
    : `${title} saved. First up ${next}.`;
}

// An event, like `lib/dayCompleteSignal.ts`: the save happens on the New
// habit screen or in the edit modal, the notice sits on the dashboard, and it
// follows the tap rather than anything a re-render could derive again.
type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function onHabitSavedNotice(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitHabitSavedNotice(message: string): void {
  for (const listener of [...listeners]) {
    try {
      listener(message);
    } catch {
      // One broken listener must not stop the others.
    }
  }
}
