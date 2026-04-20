import { Goal } from "@/types/dashboardTypes";
import { useOptimisticGoalMutation } from "@/lib/useOptimisticGoalMutation";

interface AddGoalParams {
  title: string;
  groupId: string;
}

export function useAddGoal() {
  return useOptimisticGoalMutation<AddGoalParams, Goal>({
    mutationFn: async ({ title, groupId }, { supabase, userId }) => {
      if (!title.trim() || !groupId) throw new Error("Invalid params");

      const { data, error } = await supabase
        .from("goals")
        .insert({ title: title.trim(), user_id: userId, group_id: groupId })
        .select()
        .single();

      if (error) throw error;
      return data as Goal;
    },
    getGroupId: ({ groupId }) => groupId,
    getPatch:
      ({ title, groupId }) =>
      (goals, userId) => [
        ...goals,
        {
          id: `temp-${Date.now()}`,
          title: title.trim(),
          user_id: userId,
          group_id: groupId,
          completed_today: false,
        },
      ],
  });
}
