export const queryKeys = {
  groupStats: (userId: string | undefined) => ["groupStats", userId] as const,
  groupStatsAll: () => ["groupStats"] as const,
  groupMembers: (groupId: string | null) => ["groupMembers", groupId] as const,
  groupMembersAll: () => ["groupMembers"] as const,
};
