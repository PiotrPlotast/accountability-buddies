import { useQueryClient } from "@tanstack/react-query";

import { Goal, Member } from "@/types/dashboardTypes";
import { getTodayLocalDate } from "@/lib/date";
import { emitDayComplete } from "@/lib/dayCompleteSignal";
import { celebrate, toggleDone, toggleUndone } from "@/lib/haptics";
import { isDayComplete } from "@/lib/isDayComplete";
import { queryKeys } from "@/lib/queryKeys";
import { useSupabase } from "@/hooks/useSupabase";
import { useOptimisticGoalMutation } from "@/lib/useOptimisticGoalMutation";

export function useToggleGoal() {
  const queryClient = useQueryClient();
  const { session } = useSupabase();
  const userId = session?.user.id;

  // Odczyt cache'u wisi na dotknięciu, nie na odpowiedzi serwera — dlatego to
  // nie łamie zasady „nigdy nie wibruj w reakcji na dane z serwera"
  // (lib/haptics.ts). Odświeżenie cache'u samo z siebie nic tu nie uruchomi.
  const closesOutTheDay = (goal: Goal): boolean => {
    const members = queryClient.getQueryData<Member[]>(
      queryKeys.groupMembers(goal.group_id),
    );
    const mine = members?.find((m) => m.user_id === userId)?.goals;
    // Nothing cached yet — a cold start. Fall back to the ordinary tick rather
    // than guessing at a milestone we cannot see.
    if (!mine) return false;

    const projected = mine.map((g) =>
      g.id === goal.id ? { ...g, completed_today: true } : g,
    );
    return isDayComplete(projected);
  };

  return useOptimisticGoalMutation<Goal, void>({
    mutationFn: async (goal, { supabase, userId: uid }) => {
      const today = getTodayLocalDate();
      const isNowCompleted = !goal.completed_today;

      if (isNowCompleted) {
        const { error } = await supabase.from("logs").insert({
          goal_id: goal.id,
          user_id: uid,
          date: today,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("logs")
          .delete()
          .eq("goal_id", goal.id)
          .eq("user_id", uid)
          .eq("date", today);
        if (error) throw error;
      }
    },
    getGroupId: (goal) => goal.group_id,
    getPatch: (goal) => (goals) => {
      const today = getTodayLocalDate();
      const isNowCompleted = !goal.completed_today;

      return goals.map((g) => {
        if (g.id !== goal.id) return g;
        const dates = g.completed_dates ?? [];
        return {
          ...g,
          completed_today: isNowCompleted,
          // Keep the week strip in step with the checkmark, or it lags a
          // network round-trip behind the row it sits inside.
          completed_dates: isNowCompleted
            ? [...new Set([...dates, today])].sort()
            : dates.filter((d) => d !== today),
        };
      });
    },
    beforeOptimistic: (goal) => {
      if (goal.completed_today) {
        toggleUndone();
        return;
      }
      // The last habit of the day gets the fanfare *instead of* the ordinary
      // confirmation — two buzzes on top of each other would just read as one
      // long one.
      if (closesOutTheDay(goal)) {
        celebrate();
        // The ring pulses off the same transition — one decision, so the buzz
        // and the animation can never disagree.
        emitDayComplete();
      } else {
        toggleDone();
      }
    },
    invalidateStatsOnSettle: true,
    getHeatmapDelta: (goal) => (!goal.completed_today ? 1 : -1),
  });
}
