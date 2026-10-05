import { Member } from "@/types/dashboardTypes";

/**
 * Which member's tab the dashboard shows. The picked tab wins while that
 * member is still in the group; otherwise — nothing picked yet, or they have
 * left — it is your own tab, or the first member if you aren't listed.
 *
 * Derived on every render rather than stored, so a selection can never
 * outlive the member it points at: a refetch without them moves the view
 * back to you with no effect in between.
 */
export function resolveViewedMemberId(
  members: Member[],
  selectedId: string | null,
  userId: string | undefined,
): string | null {
  if (selectedId && members.some((m) => m.user_id === selectedId)) {
    return selectedId;
  }
  if (userId && members.some((m) => m.user_id === userId)) return userId;
  return members[0]?.user_id ?? null;
}
