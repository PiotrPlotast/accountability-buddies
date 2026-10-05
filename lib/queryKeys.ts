export const queryKeys = {
  groupStats: (userId: string | undefined) => ["groupStats", userId] as const,
  groupStatsAll: () => ["groupStats"] as const,
  // Keyed by local day as well as group: `completed_today` is an answer about
  // one day, and keyed by group alone yesterday's ticks outlived midnight.
  groupMembers: (groupId: string | null, date: string) =>
    ["groupMembers", groupId, date] as const,
  // Every day's entry for one group — what mutations cancel and invalidate.
  groupMembersOfGroup: (groupId: string | null) =>
    ["groupMembers", groupId] as const,
  groupMembersAll: () => ["groupMembers"] as const,
  profile: (userId: string | undefined) => ["profile", userId] as const,
  heatmap: (userId: string | undefined) => ["heatmap", userId] as const,
  notificationPrefs: (userId: string | undefined) =>
    ["notificationPrefs", userId] as const,
};
