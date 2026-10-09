import { destructive } from "@/lib/haptics";
import {
  GoalMutationSpec,
  useOptimisticGoalMutation,
} from "@/lib/useOptimisticGoalMutation";

interface DeleteGoalParams {
  goalId: string;
  groupId: string;
  // Only for naming the habit if a delete made offline fails to sync.
  title?: string;
}

type StoredDelete = DeleteGoalParams & { userId: string };

export const deleteGoalSpec: GoalMutationSpec<
  DeleteGoalParams,
  StoredDelete,
  void
> = {
  kind: "delete",
  prepare: (vars, userId) => ({ ...vars, userId }),
  mutationFn: async ({ goalId, groupId, userId }, supabase) => {
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
  describe: ({ title }) => (title ? `Deleting "${title}"` : "Deleting a habit"),
};

export function useDeleteGoal() {
  return useOptimisticGoalMutation(deleteGoalSpec, () => destructive());
}
