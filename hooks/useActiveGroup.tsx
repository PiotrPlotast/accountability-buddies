import { useCallback } from "react";
import { useSupabase } from "@/hooks/useSupabase";
import { useGroupStats } from "@/hooks/useGroupStats";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { Goal } from "@/types/dashboardTypes";

const NO_MEMBERS: never[] = [];

/**
 * The one read of "the group I'm in": its stats, its members, and my goals
 * within it. Pure — no state, no effects, no navigation — so any component
 * can call it and every call agrees (the queries dedupe through the cache).
 *
 * The join-group redirect and the pull-to-refresh state are the dashboard's
 * alone and live in `useDashboardData`; a modal reading `activeGroupId`
 * must not carry its own copy of either.
 */
export function useActiveGroup() {
  const { session } = useSupabase();
  const userId = session?.user.id;

  const groupStats = useGroupStats();
  const groupMembers = useGroupMembers({
    groupId: groupStats.data?.group_id || null,
  });

  const members = groupMembers.data ?? NO_MEMBERS;
  const myGoals: Goal[] =
    members.find((m) => m.user_id === userId)?.goals ?? NO_MEMBERS;

  const refetchStats = groupStats.refetch;
  const refetchMembers = groupMembers.refetch;
  const refetch = useCallback(async () => {
    await Promise.all([refetchStats(), refetchMembers()]);
  }, [refetchStats, refetchMembers]);

  return {
    userId,
    loading: groupStats.isLoading || groupMembers.isLoading,
    isError: groupStats.isError || groupMembers.isError,
    // The latest answer to either read was an error. Unlike `isError` it
    // holds through a retry: a refetch of a query that never had data puts it
    // back to pending, so `isError` drops while the retry is in flight.
    readFailed:
      groupStats.errorUpdatedAt > groupStats.dataUpdatedAt ||
      groupMembers.errorUpdatedAt > groupMembers.dataUpdatedAt,
    // Read, and came back empty — distinct from "not read yet" and from a
    // read that failed. Offline with nothing cached, `isFetched` is true and
    // `data` empty too, which used to send people to join-group.
    hasNoGroup: groupStats.isSuccess && !groupStats.data,
    activeGroupId: groupStats.data?.group_id || null,
    // `null` until the group arrives. It used to be the literal "Loading...",
    // which callers then compared against — so a group actually named
    // "Loading..." read as "not loaded yet".
    groupName: groupStats.data?.name ?? null,
    groupIcon: groupStats.data?.icon || "👥",
    streak: groupStats.data?.current_streak || 0,
    inviteCode: groupStats.data?.invite_code || "",
    members,
    myGoals,
    refetch,
  };
}
