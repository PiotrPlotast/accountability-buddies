import { useEffect } from "react";
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
  const streak = groupStats.data?.current_streak || 0;
  const inviteCode = groupStats.data?.invite_code || "";
  const activeGroupId = groupStats.data?.group_id || null;
  const members = groupMembers.data || [];

  const fetchData = async () => {
    await Promise.all([groupStats.refetch(), groupMembers.refetch()]);
  };

  // Redirect if no group
  useEffect(() => {
    if (groupStats.isFetched && !groupStats.data) {
      router.replace("/(protected)/join-group");
    }
  }, [groupStats.isFetched, groupStats.data, router]);

  return {
    userId,
    loading,
    groupName,
    streak,
    inviteCode,
    members,
    activeGroupId,
    fetchData,
  };
}
