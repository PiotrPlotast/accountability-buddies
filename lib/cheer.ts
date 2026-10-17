/**
 * The client half of a cheer (E7). As with nudges the server has the final
 * say — it trims, collapses line breaks, caps at 140 and fills in a default
 * line for an empty message (`enqueue_cheer`) — so nothing here is
 * enforcement, only what the box offers before you send.
 *
 * Two kinds, worded differently on purpose: a habit cheer is about one habit
 * (from a single-habit push, or a swipe on a ticked habit), a day cheer about
 * the whole day (from a several-habit or closed-day push, or the Cheer
 * button).
 */

/** The box's `maxLength`, and the server's cap. */
export const MAX_CHEER_LENGTH = 140;

/** What a cheer is about. `goal` null is a day cheer. */
export type CheerRequest = {
  buddyId: string;
  goal: { id: string; title: string } | null;
  // The day the cheer is about, `YYYY-MM-DD`; null leaves it to the server.
  day: string | null;
};

/** Presets for a habit cheer. The first is the server's own default line. */
export function habitCheerPresets(habitTitle: string): string[] {
  return [
    `Nice work on ${habitTitle}!`,
    "Love to see it 🔥",
    "Keep it up 💪",
    "That's the way 👏",
  ].map((line) => line.slice(0, MAX_CHEER_LENGTH));
}

/** Presets for a day cheer. The first is the server's own default line. */
export const DAY_CHEER_PRESETS = [
  "What a day! Keep it going 🔥",
  "Proud of you 👏",
  "Crushing it today 💪",
  "That's how it's done 🙌",
] as const;

const CHEERABLE_TYPES = new Set<unknown>(["buddy_ticked", "buddy_done"]);

/**
 * The cheer a tapped push offers, or null for none. A `buddy_ticked` push
 * about one habit names it (`goal_id`, `goal_title`) and gets a habit cheer;
 * several habits or a closed day get a day cheer. Pushes from before E7 carry
 * no `day`, which the server then reads as its own today.
 */
export function cheerFromTap(
  data: Record<string, unknown>,
): CheerRequest | null {
  if (!CHEERABLE_TYPES.has(data.type) || typeof data.buddy_id !== "string") {
    return null;
  }
  const goal =
    typeof data.goal_id === "string" && typeof data.goal_title === "string"
      ? { id: data.goal_id, title: data.goal_title }
      : null;
  return {
    buddyId: data.buddy_id,
    goal,
    day: typeof data.day === "string" ? data.day : null,
  };
}
