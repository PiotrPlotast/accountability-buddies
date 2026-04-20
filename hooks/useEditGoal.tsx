import { useOptimisticGoalMutation } from "@/lib/useOptimisticGoalMutation";

interface EditGoalParams {
  goalId: string;
  newTitle: string;
  groupId: string;
}

export function useEditGoal() {
  return useOptimisticGoalMutation<EditGoalParams, void>({
    mutationFn: async ({ goalId, newTitle }, { supabase, userId }) => {
      if (!goalId || !newTitle.trim()) throw new Error("Invalid params");

      const { error } = await supabase
        .from("goals")
        .update({ title: newTitle.trim() })
        .eq("id", goalId)
        .eq("user_id", userId);

      if (error) throw error;
    },
    getGroupId: ({ groupId }) => groupId,
    getPatch:
      ({ goalId, newTitle }) =>
      (goals) =>
        goals.map((g) =>
          g.id === goalId ? { ...g, title: newTitle.trim() } : g,
        ),
  });
}
