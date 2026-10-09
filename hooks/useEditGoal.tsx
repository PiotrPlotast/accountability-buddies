import { tapLight } from "@/lib/haptics";
import {
  GoalMutationSpec,
  useOptimisticGoalMutation,
} from "@/lib/useOptimisticGoalMutation";
import { ALL_DAYS } from "@/lib/repeatDays";

interface EditGoalParams {
  goalId: string;
  newTitle: string;
  groupId: string;
  icon?: string | null;
  repeatDays?: number[];
  // `null` clears the reminder; `undefined` leaves it alone.
  reminderTime?: string | null;
}

type GoalEdits = {
  title: string;
  icon?: string | null;
  repeat_days?: number[];
  reminder_time?: string | null;
};

// `icon` and `repeatDays` are optional so a title-only edit doesn't clobber
// them. Building the row patch and the optimistic patch from one place keeps
// the cache and the server in step.
function buildEdits({
  newTitle,
  icon,
  repeatDays,
  reminderTime,
}: EditGoalParams): GoalEdits {
  const edits: GoalEdits = { title: newTitle.trim() };
  if (icon !== undefined) edits.icon = icon;
  if (repeatDays !== undefined) {
    // An empty selection means "every day", same as habit creation.
    edits.repeat_days = repeatDays.length > 0 ? repeatDays : ALL_DAYS;
  }
  if (reminderTime !== undefined) edits.reminder_time = reminderTime;
  return edits;
}

type StoredEdit = EditGoalParams & { userId: string };

export const editGoalSpec: GoalMutationSpec<EditGoalParams, StoredEdit, void> =
  {
    kind: "edit",
    prepare: (vars, userId) => ({ ...vars, userId }),
    mutationFn: async (vars, supabase) => {
      if (!vars.goalId || !vars.newTitle.trim())
        throw new Error("Invalid params");

      const { error } = await supabase
        .from("goals")
        .update(buildEdits(vars))
        .eq("id", vars.goalId)
        .eq("user_id", vars.userId);

      if (error) throw error;
    },
    getGroupId: ({ groupId }) => groupId,
    getPatch: (vars) => (goals) =>
      goals.map((g) =>
        g.id === vars.goalId ? { ...g, ...buildEdits(vars) } : g,
      ),
    describe: ({ newTitle }) => `Editing "${newTitle.trim()}"`,
  };

export function useEditGoal() {
  return useOptimisticGoalMutation(editGoalSpec, () => tapLight());
}
