import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";
import { Goal, Member } from "@/types/dashboardTypes";
import * as Haptics from "expo-haptics";

export function useToggleGoal() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goal: Goal) => {
      if (!userId) throw new Error("No user");

      const today = new Date().toLocaleDateString("en-CA");
      const isNowCompleted = !goal.completed_today;

      if (isNowCompleted) {
        await supabase.from("logs").insert({
          goal_id: goal.id,
          user_id: userId,
          date: today,
        });
      } else {
        await supabase
          .from("logs")
          .delete()
          .eq("goal_id", goal.id)
          .eq("user_id", userId)
          .eq("date", today);
      }
    },
    onMutate: async (goal: Goal) => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Optimistic update
      queryClient.setQueryData<Member[]>(
        ["groupMembers", goal.group_id],
        (old) => {
          if (!old) return old;
          return old.map((m) => {
            if (m.user_id !== userId) return m;
            return {
              ...m,
              goals: m.goals.map((g) =>
                g.id === goal.id
                  ? { ...g, completed_today: !goal.completed_today }
                  : g,
              ),
            };
          });
        },
      );
    },
    onSettled: () => {
      // Invalidate to refetch and recalculate streak/waiting
      queryClient.invalidateQueries({ queryKey: ["groupStats"] });
      queryClient.invalidateQueries({ queryKey: ["groupMembers"] });
    },
  });
}
