/**
 * The client half of a nudge's wording. The server has the final say — it
 * trims, collapses line breaks, caps at 140 and fills in a default for an
 * empty message (`enqueue_nudge`) — so nothing here is enforcement, only what
 * the box shows before you send.
 */

/** The box's `maxLength`, and the server's cap. */
export const MAX_NUDGE_LENGTH = 140;

/** The first word of a full name, the way the member tabs label a buddy. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "your buddy";
}

/**
 * What a swipe on a buddy's habit prefills: "Ada, what about your run?".
 * Only the title's first letter is lowered, so "Read Dune" keeps its "Dune".
 */
export function habitNudgeMessage(name: string, habitTitle: string): string {
  const title = habitTitle.charAt(0).toLowerCase() + habitTitle.slice(1);
  return `${name}, what about your ${title}?`.slice(0, MAX_NUDGE_LENGTH);
}
