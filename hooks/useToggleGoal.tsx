import { useQueryClient } from "@tanstack/react-query";

import { Goal, Member } from "@/types/dashboardTypes";
import { getTodayLocalDate } from "@/lib/date";
import { emitDayComplete } from "@/lib/dayCompleteSignal";
import { celebrate, toggleDone, toggleUndone } from "@/lib/haptics";
import { isDayComplete } from "@/lib/isDayComplete";
import { queryKeys } from "@/lib/queryKeys";
import { useSupabase } from "@/hooks/useSupabase";
import {
  GoalMutationSpec,
  useOptimisticGoalMutation,
} from "@/lib/useOptimisticGoalMutation";

// The day is captured at the tap. A tick made offline at 23:59 and synced the
// next morning belongs to the evening it was made, not the morning it arrived.
type StoredToggle = {
  goalId: string;
  groupId: string;
  title: string;
  done: boolean;
  date: string;
  userId: string;
};

// The server only takes a check-in dated within a day of its own date.
const TOO_OLD = "42501";

export const toggleGoalSpec: GoalMutationSpec<Goal, StoredToggle, void> = {
  kind: "toggle",
  prepare: (goal, userId) => ({
    goalId: goal.id,
    groupId: goal.group_id,
    title: goal.title,
    done: !goal.completed_today,
    date: getTodayLocalDate(),
    userId,
  }),
  mutationFn: async ({ goalId, done, date, userId }, supabase) => {
    if (done) {
      const { error } = await supabase.from("logs").insert({
        goal_id: goalId,
        user_id: userId,
        date,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("logs")
        .delete()
        .eq("goal_id", goalId)
        .eq("user_id", userId)
        .eq("date", date);
      if (error) throw error;
    }
  },
  getGroupId: ({ groupId }) => groupId,
  getPatch:
    ({ goalId, done, date }) =>
    (goals) =>
      goals.map((g) => {
        if (g.id !== goalId) return g;
        const dates = g.completed_dates ?? [];
        return {
          ...g,
          completed_today: done,
          // Keep the week strip in step with the checkmark, or it lags a
          // network round-trip behind the row it sits inside.
          completed_dates: done
            ? [...new Set([...dates, date])].sort()
            : dates.filter((d) => d !== date),
        };
      }),
  describe: ({ title, done }) => `${done ? "Ticking" : "Unticking"} "${title}"`,
  explain: (error) =>
    (error as { code?: string } | null)?.code === TOO_OLD
      ? "Too late to sync, a tick only counts within a day."
      : null,
  invalidateStatsOnSettle: true,
  getHeatmapDelta: ({ done }) => (done ? 1 : -1),
};

export function useToggleGoal() {
  const queryClient = useQueryClient();
  const { session } = useSupabase();
  const userId = session?.user.id;

  // Odczyt cache'u wisi na dotknięciu, nie na odpowiedzi serwera — dlatego to
  // nie łamie zasady „nigdy nie wibruj w reakcji na dane z serwera"
  // (lib/haptics.ts). Odświeżenie cache'u samo z siebie nic tu nie uruchomi.
  const closesOutTheDay = (goal: Goal): boolean => {
    const members = queryClient.getQueryData<Member[]>(
      queryKeys.groupMembers(goal.group_id, getTodayLocalDate()),
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

  return useOptimisticGoalMutation(toggleGoalSpec, (goal) => {
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
  });
}
