import { Goal } from "@/types/dashboardTypes";
import { useOptimisticGoalMutation } from "@/lib/useOptimisticGoalMutation";

interface AddGoalParams {
  title: string;
  groupId: string;
  icon?: string | null;
  repeatDays?: number[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function useAddGoal() {
  return useOptimisticGoalMutation<AddGoalParams, Goal>({
    mutationFn: async (
      { title, groupId, icon, repeatDays },
      { supabase, userId },
    ) => {
      if (!title.trim() || !groupId) throw new Error("Invalid params");

      const { data, error } = await supabase
        .from("goals")
        .insert({
          title: title.trim(),
          user_id: userId,
          group_id: groupId,
          icon: icon ?? null,
          repeat_days:
            repeatDays && repeatDays.length > 0 ? repeatDays : ALL_DAYS,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Goal;
    },
    getGroupId: ({ groupId }) => groupId,
    getPatch:
      ({ title, groupId, icon, repeatDays }) =>
      (goals, userId) => [
        ...goals,
        {
          id: `temp-${Date.now()}`,
          title: title.trim(),
          user_id: userId,
          group_id: groupId,
          completed_today: false,
          icon: icon ?? null,
          repeat_days:
            repeatDays && repeatDays.length > 0 ? repeatDays : ALL_DAYS,
        },
      ],
  });
}
