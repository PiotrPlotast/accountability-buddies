import { randomUUID } from "expo-crypto";

import { Goal } from "@/types/dashboardTypes";
import { tapLight } from "@/lib/haptics";
import {
  GoalMutationSpec,
  useOptimisticGoalMutation,
} from "@/lib/useOptimisticGoalMutation";
import { ALL_DAYS } from "@/lib/repeatDays";

interface AddGoalParams {
  title: string;
  groupId: string;
  icon?: string | null;
  repeatDays?: number[];
  // `"HH:MM"`; omitted or null means no reminder.
  reminderTime?: string | null;
}

// The id is made on the phone, at the tap: the row on screen and the row the
// insert writes are the same habit, so a tick or an edit queued behind an
// offline create already points at it.
type StoredAdd = Omit<AddGoalParams, "repeatDays"> & {
  id: string;
  repeatDays: number[];
  userId: string;
};

export const addGoalSpec: GoalMutationSpec<AddGoalParams, StoredAdd, Goal> = {
  kind: "add",
  prepare: (vars, userId) => ({
    ...vars,
    title: vars.title.trim(),
    id: randomUUID(),
    repeatDays:
      vars.repeatDays && vars.repeatDays.length > 0
        ? vars.repeatDays
        : ALL_DAYS,
    userId,
  }),
  mutationFn: async (
    { id, title, groupId, icon, repeatDays, reminderTime, userId },
    supabase,
  ) => {
    if (!title || !groupId) throw new Error("Invalid params");

    const { data, error } = await supabase
      .from("goals")
      .insert({
        id,
        title,
        user_id: userId,
        group_id: groupId,
        icon: icon ?? null,
        repeat_days: repeatDays,
        ...(reminderTime ? { reminder_time: reminderTime } : {}),
      })
      .select()
      .single();

    if (error) throw error;
    return data as Goal;
  },
  getGroupId: ({ groupId }) => groupId,
  getPatch:
    ({ id, title, groupId, icon, repeatDays, reminderTime }) =>
    (goals, userId) => [
      ...goals,
      {
        id,
        title,
        user_id: userId,
        group_id: groupId,
        completed_today: false,
        completed_dates: [],
        icon: icon ?? null,
        repeat_days: repeatDays,
        reminder_time: reminderTime ?? null,
      },
    ],
  describe: ({ title }) => `Adding "${title}"`,
};

export function useAddGoal() {
  // A tap, not a `Success` — ticking off a habit is the one gesture that gets
  // the celebratory pattern, and it stops being distinct if everything
  // shares it.
  return useOptimisticGoalMutation(addGoalSpec, () => tapLight());
}
