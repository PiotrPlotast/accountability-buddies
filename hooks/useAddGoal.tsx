import { Goal } from "@/types/dashboardTypes";
import { tapLight } from "@/lib/haptics";
import { useOptimisticGoalMutation } from "@/lib/useOptimisticGoalMutation";
import { ALL_DAYS } from "@/lib/repeatDays";

interface AddGoalParams {
  title: string;
  groupId: string;
  icon?: string | null;
  repeatDays?: number[];
}

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
    // A tap, not a `Success` — ticking off a habit is the one gesture that gets
    // the celebratory pattern, and it stops being distinct if everything
    // shares it.
    beforeOptimistic: () => tapLight(),
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
          completed_dates: [],
          icon: icon ?? null,
          repeat_days:
            repeatDays && repeatDays.length > 0 ? repeatDays : ALL_DAYS,
        },
      ],
  });
}
