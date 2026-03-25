import { useEffect, useMemo } from "react";
import { useRouter } from "expo-router";
import { useSupabase } from "@/hooks/useSupabase";
import { useGroupStats } from "@/hooks/useGroupStats";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { useToggleGoal } from "@/hooks/useToggleGoal";
import { useAddGoal } from "@/hooks/useAddGoal";
import { useDeleteGoal } from "@/hooks/useDeleteGoal";
import { useEditGoal } from "@/hooks/useEditGoal";
import { Goal } from "@/types/dashboardTypes";

export function useDashboard() {
  const { session } = useSupabase();
  const userId = session?.user.id;
  const router = useRouter();

  const groupStats = useGroupStats();
  const groupMembers = useGroupMembers({
    groupId: groupStats.data?.group_id || null,
  });

  const toggleMutation = useToggleGoal();
  const addMutation = useAddGoal();
  const deleteMutation = useDeleteGoal();
  const editMutation = useEditGoal();

  const loading = groupStats.isLoading || groupMembers.isLoading;
  const groupName = groupStats.data?.name || "Loading...";
  const streak = groupStats.data?.current_streak || 0;
  const inviteCode = groupStats.data?.invite_code || "";
  const activeGroupId = groupStats.data?.group_id || null;
  const members = groupMembers.data || [];

  const isWaiting = useMemo(() => {
    if (!groupStats.data || !groupMembers.data) return false;
    const today = new Date().toLocaleDateString("en-CA");
    const lastDate = groupStats.data.last_streak_date;
    const streakNotUpdatedToday = lastDate !== today;
    const myData = groupMembers.data.find((m) => m.user_id === userId);
    const iHaveContributed = myData?.goals.some((g) => g.completed_today);
    return !!(streakNotUpdatedToday && iHaveContributed);
  }, [groupStats.data, groupMembers.data, userId]);

  const fetchData = async () => {
    await Promise.all([groupStats.refetch(), groupMembers.refetch()]);
  };

  const toggleGoal = (goal: Goal) => {
    toggleMutation.mutate(goal);
  };

  const addGoal = async (title: string) => {
    if (!activeGroupId) return;
    addMutation.mutate({ title, groupId: activeGroupId });
  };

  const deleteGoal = async (goalId: string) => {
    if (!activeGroupId) return;
    deleteMutation.mutate({ goalId, groupId: activeGroupId });
  };

  const editGoal = (goalId: string, newTitle: string) => {
    if (!activeGroupId) return;
    editMutation.mutate({ goalId, newTitle, groupId: activeGroupId });
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
    isWaiting,
    fetchData,
    toggleGoal,
    addGoal,
    deleteGoal,
    editGoal,
  };
}
