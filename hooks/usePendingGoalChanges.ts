import { useMutationState } from "@tanstack/react-query";

import { GOAL_MUTATION_KEY } from "@/lib/useOptimisticGoalMutation";

/**
 * How many changes to your habits haven't reached the server yet: queued
 * offline, restored from the last session, or on their way now.
 */
export function usePendingGoalChanges(): number {
  return useMutationState({
    filters: { mutationKey: GOAL_MUTATION_KEY, status: "pending" },
  }).length;
}
