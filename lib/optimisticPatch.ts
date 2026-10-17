import { Alert } from "react-native";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { errorMessage } from "@/lib/errorMessage";
import { error as errorHaptic } from "@/lib/haptics";

type Options<T, V> = {
  queryClient: QueryClient;
  queryKey: QueryKey;
  // The cache entry with the change applied, or `undefined` to leave it be
  // (nothing read yet, so there is nothing to patch).
  patch: (previous: T | null | undefined, vars: V) => T | undefined;
  // The Alert's line when the error carries nothing readable.
  fallback?: string;
};

/**
 * The lifecycle of a one-row optimistic write that isn't a goal: cancel,
 * snapshot, patch, roll back with the `error()` buzz and an Alert, invalidate
 * on settle. Spread into `useMutation` beside the `mutationFn`.
 *
 * Goals don't use this — they go through `lib/useOptimisticGoalMutation.ts`,
 * which also queues offline. These writes need the server and say so.
 */
export function optimisticPatchOptions<T, V>({
  queryClient,
  queryKey,
  patch,
  fallback,
}: Options<T, V>) {
  return {
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<T | null>(queryKey);
      const next = patch(previous, vars);
      if (next !== undefined) queryClient.setQueryData<T>(queryKey, next);
      return { previous };
    },
    onError: (
      err: unknown,
      _vars: V,
      ctx: { previous: T | null | undefined } | undefined,
    ) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(queryKey, ctx.previous);
      }
      errorHaptic();
      Alert.alert("Couldn't save", errorMessage(err, fallback));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  };
}
