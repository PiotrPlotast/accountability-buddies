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

  const addGoal = async (
    title: string,
    opts?: {
      icon?: string | null;
      repeatDays?: number[];
      reminderTime?: string | null;
    },
  ) => {
    if (!activeGroupId) return;
    await addMutation.mutateAsync({
      title,
      groupId: activeGroupId,
      icon: opts?.icon ?? null,
      repeatDays: opts?.repeatDays,
      reminderTime: opts?.reminderTime,
    });
  };

  // `title` only names the habit if a delete made offline fails to sync.
  const deleteGoal = async (goalId: string, title?: string) => {
    if (!activeGroupId) return;
    await deleteMutation.mutateAsync({ goalId, groupId: activeGroupId, title });
  };

  const editGoal = async (
    goalId: string,
    updates: {
      title: string;
      icon?: string | null;
      repeatDays?: number[];
      reminderTime?: string | null;
    },
  ) => {
    if (!activeGroupId) return;
    await editMutation.mutateAsync({
      goalId,
      newTitle: updates.title,
      groupId: activeGroupId,
      icon: updates.icon,
      repeatDays: updates.repeatDays,
      reminderTime: updates.reminderTime,
    });
  };

  return {
    toggleGoal,
    addGoal,
    deleteGoal,
    editGoal,
  };
}
