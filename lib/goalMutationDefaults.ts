import type { SupabaseClient } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";

import { addGoalSpec } from "@/hooks/useAddGoal";
import { deleteGoalSpec } from "@/hooks/useDeleteGoal";
import { editGoalSpec } from "@/hooks/useEditGoal";
import { toggleGoalSpec } from "@/hooks/useToggleGoal";
import {
  GoalMutationSpec,
  goalMutationOptions,
  StoredVars,
} from "@/lib/useOptimisticGoalMutation";

/**
 * Teach the client how to run every goal mutation by its key. This has to
 * happen before the persisted cache is restored: a change queued offline comes
 * back from AsyncStorage as a key and its variables, and without a default to
 * match it fails with "No mutationFn found".
 */
export function registerGoalMutationDefaults(
  queryClient: QueryClient,
  getSupabase: () => SupabaseClient,
) {
  const register = <TVars, TStored extends StoredVars, TData>(
    spec: GoalMutationSpec<TVars, TStored, TData>,
  ) => {
    const options = goalMutationOptions(queryClient, getSupabase, spec);
    queryClient.setMutationDefaults(options.mutationKey!, options);
  };
  register(addGoalSpec);
  register(toggleGoalSpec);
  register(editGoalSpec);
  register(deleteGoalSpec);
}
