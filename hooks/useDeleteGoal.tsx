import { useOptimisticGoalMutation } from "@/lib/useOptimisticGoalMutation";

interface DeleteGoalParams {
  goalId: string;
  groupId: string;
}

export function useDeleteGoal() {
  return useOptimisticGoalMutation<DeleteGoalParams, void>({
    mutationFn: async ({ goalId, groupId }, { supabase, userId }) => {
      if (!goalId || !groupId) throw new Error("Invalid params");

      const { data, error } = await supabase
        .from("goals")
        .delete()
        .eq("id", goalId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      if (!data)
        throw new Error(
          "Could not delete this goal. You might not have permission.",
        );
    },
    getGroupId: ({ groupId }) => groupId,
    getPatch:
      ({ goalId }) =>
      (goals) =>
        goals.filter((g) => g.id !== goalId),
  });
}
