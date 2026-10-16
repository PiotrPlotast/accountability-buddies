import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The first-run walkthrough: what it says, and this phone's memory of it.
 *
 * Whether the tour is owed is decided per account by
 * `profiles.tour_seen_at` (`hooks/useTour.ts`). The local flag exists for the
 * one case the column can't cover: a tour finished offline. It keeps the tour
 * dismissed until `useTourSeenSync` has told the server, so nobody is walked
 * through it twice because the write was queued.
 */

export type TourSlide = {
  id: string;
  emoji: string;
  title: string;
  body: string;
};

export const TOUR_SLIDES: readonly TourSlide[] = [
  {
    id: "habits",
    emoji: "✅",
    title: "Your habits, every day",
    body: "Add the habits you want to keep and pick the days they repeat. Tick them off as you go, and the ring at the top fills up as your day gets done.",
  },
  {
    id: "buddies",
    emoji: "👯",
    title: "Your buddies",
    body: "Each person in your group has a tab at the top of Home. Tap one to see their day. They can see yours too, so that's the accountability part.",
  },
  {
    id: "nudges",
    emoji: "👉",
    title: "Nudge a friend",
    body: "On a buddy's tab, tap Nudge to send them a push, or swipe right on one of their habits to nudge them about that one.",
  },
  {
    id: "reminders",
    emoji: "⏰",
    title: "Reminders",
    body: "Give a habit a time and we'll remind you if it isn't ticked by then. Quiet hours and the rest of your notifications live behind the gear on Profile.",
  },
  {
    id: "streak",
    emoji: "🔥",
    title: "Keep the streak alive",
    body: "Your group's streak grows on every day everyone finishes what's due. Next, join a group with an invite code or start your own.",
  },
];

const keyFor = (userId: string) => `tour-seen:${userId}`;

/** Whether this user dismissed the tour on this phone. Never throws. */
export async function wasTourSeenLocally(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(userId))) === "1";
  } catch {
    return false;
  }
}

/** Remember that this user dismissed the tour on this phone. Never throws. */
export async function markTourSeenLocally(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), "1");
  } catch {
    // The server copy is the real record; this only covers an offline finish.
  }
}
