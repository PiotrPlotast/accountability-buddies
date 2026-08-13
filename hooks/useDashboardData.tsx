import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useSupabase } from "@/hooks/useSupabase";
import { useGroupStats } from "@/hooks/useGroupStats";
import { useGroupMembers } from "@/hooks/useGroupMembers";

export function useDashboardData() {
  const { session } = useSupabase();
  const userId = session?.user.id;
  const router = useRouter();

  const groupStats = useGroupStats();
  const groupMembers = useGroupMembers({
    groupId: groupStats.data?.group_id || null,
  });

  const loading = groupStats.isLoading || groupMembers.isLoading;
  const groupName = groupStats.data?.name || "Loading...";
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

  // Redirect if no group
  useEffect(() => {
    if (groupStats.isFetched && !groupStats.data) {
      router.replace("/(protected)/join-group");
    }
  }, [groupStats.isFetched, groupStats.data, router]);

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
