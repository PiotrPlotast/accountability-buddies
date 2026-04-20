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
    getPatch: (goal) => (goals) =>
      goals.map((g) =>
        g.id === goal.id ? { ...g, completed_today: !goal.completed_today } : g,
      ),
    beforeOptimistic: () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    invalidateStatsOnSettle: true,
  });
}
