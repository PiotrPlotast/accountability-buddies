import {
  useMutation,
  useQueryClient,
  UseMutationResult,
} from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "react-native";

import { useSupabase } from "@/hooks/useSupabase";
import { queryKeys } from "@/lib/queryKeys";
import { Goal, Member } from "@/types/dashboardTypes";

type PatchMyGoals = (goals: Goal[], userId: string) => Goal[];

export interface GoalMutationContext {
  supabase: SupabaseClient;
  userId: string;
}

interface Options<TVars, TData> {
  mutationFn: (vars: TVars, ctx: GoalMutationContext) => Promise<TData>;
  getGroupId: (vars: TVars) => string;
  getPatch: (vars: TVars) => PatchMyGoals;
  beforeOptimistic?: (vars: TVars) => void | Promise<void>;
  invalidateStatsOnSettle?: boolean;
}

type RollbackContext = { previousMembers: Member[] | undefined };

export function useOptimisticGoalMutation<TVars, TData = unknown>(
  opts: Options<TVars, TData>,
): UseMutationResult<TData, unknown, TVars, RollbackContext> {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVars, RollbackContext>({
    mutationFn: async (vars) => {
      if (!userId) throw new Error("No user");
      return opts.mutationFn(vars, { supabase, userId });
    },
    onMutate: async (vars) => {
      if (opts.beforeOptimistic) await opts.beforeOptimistic(vars);

      const key = queryKeys.groupMembers(opts.getGroupId(vars));
      await queryClient.cancelQueries({ queryKey: key });
      const previousMembers = queryClient.getQueryData<Member[]>(key);

      if (!userId) return { previousMembers };

      const patch = opts.getPatch(vars);
      queryClient.setQueryData<Member[]>(key, (old) => {
        if (!old) return old;
        return old.map((m) =>
          m.user_id === userId ? { ...m, goals: patch(m.goals, userId) } : m,
        );
      });

      return { previousMembers };
    },
    onError: (error, vars, context) => {
      const key = queryKeys.groupMembers(opts.getGroupId(vars));
      if (context?.previousMembers) {
        queryClient.setQueryData(key, context.previousMembers);
      }
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert("Error", message);
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupMembers(opts.getGroupId(vars)),
      });
      if (opts.invalidateStatsOnSettle) {
        queryClient.invalidateQueries({ queryKey: queryKeys.groupStatsAll() });
      }
    },
  });
}
