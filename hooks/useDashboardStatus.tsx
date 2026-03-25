import { useMemo } from "react";
import { useGroupStats } from "@/hooks/useGroupStats";
import { useGroupMembers } from "@/hooks/useGroupMembers";

export function useDashboardStatus(userId: string | undefined) {
  const groupStats = useGroupStats();
  const groupMembers = useGroupMembers({
    groupId: groupStats.data?.group_id || null,
  });

  const isWaiting = useMemo(() => {
    if (!groupStats.data || !groupMembers.data) return false;
    const today = new Date().toLocaleDateString("en-CA");
    const lastDate = groupStats.data.last_streak_date;
    const streakNotUpdatedToday = lastDate !== today;
    const myData = groupMembers.data.find((m) => m.user_id === userId);
    const iHaveContributed = myData?.goals.some((g) => g.completed_today);
    return !!(streakNotUpdatedToday && iHaveContributed);
  }, [groupStats.data, groupMembers.data, userId]);

  return {
    isWaiting,
  };
}
