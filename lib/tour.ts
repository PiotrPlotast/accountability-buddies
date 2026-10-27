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
  id: "habits" | "manage" | "buddies" | "reminders" | "streak";
  title: string;
  body: string;
  // What to do with the slide's demo (`app/components/tour/TourDemos.tsx`).
  hint: string;
};

export const TOUR_SLIDES: readonly TourSlide[] = [
  {
    id: "habits",
    title: "Your habits, every day",
    body: "Add the habits you want to keep and tick them off as you do them. The ring fills up as your day gets done.",
    hint: "Try it: tick both habits and watch the ring close.",
  },
  {
    id: "manage",
    title: "Edit or delete a habit",
    body: "Swipe a habit right to change its name, icon, days or reminder, and left to delete it. The Habits button on Home lists all of them, even ones not due today.",
    hint: "Try it: swipe a habit right to edit it, or left to delete it.",
  },
  {
    id: "buddies",
    title: "Your buddies",
    body: "Everyone in your group has a tab at the top of Home, and they can see your day too. On a buddy's tab, Nudge sends them a push, and swiping right on one of their habits nudges them about that one.",
    hint: "Try it: open Ada's tab and send her a nudge.",
  },
  {
    id: "reminders",
    title: "Reminders",
    body: "Give a habit a time and you'll get a push if it isn't ticked by then. Quiet hours and the rest of your notifications are behind the gear on Profile.",
    hint: "Try it: switch the reminder on and pick a time.",
  },
  {
    id: "streak",
    title: "Keep the streak alive",
    body: "Your group's streak grows on every day that everyone ticks at least one habit that's due. Invite friends with your group's code, then join a group or start your own.",
    hint: "Try it: tick a habit and watch the streak go up.",
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
