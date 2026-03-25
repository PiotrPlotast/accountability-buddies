import { useToggleGoal } from "@/hooks/useToggleGoal";
import { useAddGoal } from "@/hooks/useAddGoal";
import { useDeleteGoal } from "@/hooks/useDeleteGoal";
import { useEditGoal } from "@/hooks/useEditGoal";
import { Goal } from "@/types/dashboardTypes";

export function useDashboardActions(activeGroupId: string | null) {
  const toggleMutation = useToggleGoal();
  const addMutation = useAddGoal();
  const deleteMutation = useDeleteGoal();
  const editMutation = useEditGoal();

  const toggleGoal = (goal: Goal) => {
    toggleMutation.mutate(goal);
  };

  const addGoal = async (title: string) => {
    if (!activeGroupId) return;
    await addMutation.mutateAsync({ title, groupId: activeGroupId });
  };

  const deleteGoal = async (goalId: string) => {
    if (!activeGroupId) return;
    await deleteMutation.mutateAsync({ goalId, groupId: activeGroupId });
  };

  const editGoal = async (goalId: string, newTitle: string) => {
    if (!activeGroupId) return;
    await editMutation.mutateAsync({
      goalId,
      newTitle,
      groupId: activeGroupId,
    });
  };

  return {
    toggleGoal,
    addGoal,
    deleteGoal,
    editGoal,
  };
}
