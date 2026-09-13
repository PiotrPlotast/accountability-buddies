import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useSupabase } from "@/hooks/useSupabase";
import { useGroupStats } from "@/hooks/useGroupStats";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { useNameGate } from "@/hooks/useNameGate";

export function useDashboardData() {
  const { session } = useSupabase();
  const userId = session?.user.id;
  const router = useRouter();

  const groupStats = useGroupStats();
  const groupMembers = useGroupMembers({
    groupId: groupStats.data?.group_id || null,
  });

  const loading = groupStats.isLoading || groupMembers.isLoading;
  // `null` until the group arrives, matching `useProfileData`. It used to be
  // the literal "Loading...", which callers then compared against — so a group
  // actually named "Loading..." read as "not loaded yet".
  const groupName = groupStats.data?.name ?? null;
  const groupIcon = groupStats.data?.icon || "👥";
  const streak = groupStats.data?.current_streak || 0;
  const inviteCode = groupStats.data?.invite_code || "";
  const activeGroupId = groupStats.data?.group_id || null;
  const members = groupMembers.data || [];

  // Bound to the explicit refresh gesture rather than the queries' own
  // `isRefetching`, which also flips on background invalidation (every goal
  // toggle invalidates `groupMembers`) and would spin the control unprompted.
  const [refreshing, setRefreshing] = useState(false);

  const refetchStats = groupStats.refetch;
  const refetchMembers = groupMembers.refetch;

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchStats(), refetchMembers()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchStats, refetchMembers]);

  // Redirect if no group — but never ahead of the name gate. A brand new
  // account has neither a name nor a group, and both answers arrive from
  // separate round trips, so whichever resolved last used to win. The name
  // screen owns that user; this waits for a name before sending anyone
  // anywhere. `(protected)/_layout.tsx` normally keeps the dashboard
  // unmounted in that state, which leaves this covering the window before the
  // profile has been read.
  const { isResolved: nameResolved, needsName } = useNameGate();

  useEffect(() => {
    if (!nameResolved || needsName) return;
    if (groupStats.isFetched && !groupStats.data) {
      router.replace("/(protected)/join-group");
    }
  }, [groupStats.isFetched, groupStats.data, nameResolved, needsName, router]);

  return {
    userId,
    loading,
    refreshing,
    groupName,
    groupIcon,
    streak,
    inviteCode,
    members,
    activeGroupId,
    fetchData,
  };
}
