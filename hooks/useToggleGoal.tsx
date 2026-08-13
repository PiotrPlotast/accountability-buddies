import * as Haptics from "expo-haptics";

import { Goal } from "@/types/dashboardTypes";
import { getTodayLocalDate } from "@/lib/date";
import { useOptimisticGoalMutation } from "@/lib/useOptimisticGoalMutation";

export function useToggleGoal() {
  return useOptimisticGoalMutation<Goal, void>({
    mutationFn: async (goal, { supabase, userId }) => {
      const today = getTodayLocalDate();
      const isNowCompleted = !goal.completed_today;

      if (isNowCompleted) {
        const { error } = await supabase.from("logs").insert({
          goal_id: goal.id,
          user_id: userId,
          date: today,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("logs")
          .delete()
          .eq("goal_id", goal.id)
          .eq("user_id", userId)
          .eq("date", today);
        if (error) throw error;
      }
    },
    getGroupId: (goal) => goal.group_id,
    getPatch: (goal) => (goals) => {
      const today = getTodayLocalDate();
      const isNowCompleted = !goal.completed_today;

      return goals.map((g) => {
        if (g.id !== goal.id) return g;
        const dates = g.completed_dates ?? [];
        return {
          ...g,
          completed_today: isNowCompleted,
          // Keep the week strip in step with the checkmark, or it lags a
          // network round-trip behind the row it sits inside.
          completed_dates: isNowCompleted
            ? [...new Set([...dates, today])].sort()
            : dates.filter((d) => d !== today),
        };
      });
    },
    beforeOptimistic: () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    invalidateStatsOnSettle: true,
    getHeatmapDelta: (goal) => (!goal.completed_today ? 1 : -1),
  });
}
