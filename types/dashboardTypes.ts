export type Goal = {
  id: string;
  title: string;
  user_id: string;
  completed_today: boolean;
  // `YYYY-MM-DD` for every day in the trailing window that has a log, oldest
  // first. Derived alongside `completed_today` from the same nested `logs`.
  // Optional so cached entries written before the window widened still parse.
  completed_dates?: string[];
  group_id: string;
  icon: string | null;
  repeat_days: number[];
  // `"HH:MM"` in the owner's timezone, or null for no reminder. Optional so
  // cached entries written before reminders existed still parse.
  reminder_time?: string | null;
  // Today's photo of this habit, as far as the server lets the viewer see it
  // (`habit_photo_is_visible`): a buddy's only while it is live, your own
  // also once removed, because the day's photo is used up either way.
  // Optional so cached entries written before photos existed still parse.
  photo?: HabitPhoto | null;
};

export type HabitPhoto = {
  id: string;
  // In the `habit-photos` bucket; what a signed URL is made from.
  path: string;
  createdAt: string;
  // Deleted by its owner or unticked away. Kept so the app knows the habit's
  // photo for the day is used: a photo is final.
  removed: boolean;
};

export type Member = {
  user_id: string;
  full_name: string;
  goals: Goal[];
};

export type ProfileRow = {
  full_name: string | null;
  avatar_url: string | null;
  // When the first-run tour was finished or skipped; null until then.
  // Optional because a profile cached before the column existed has no key at
  // all, which `useTourGate` must not read as "never seen".
  tour_seen_at?: string | null;
};

export type GroupResult = {
  group_id: string;
  name: string;
  icon: string;
  current_streak: number;
  invite_code: string;
  last_streak_date: string | null;
  groups: {
    last_streak_date: string | null;
    current_streak: number;
  };
};
