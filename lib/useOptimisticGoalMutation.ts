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
  getHeatmapDelta?: (vars: TVars) => number;
}

type RollbackContext = {
  previousMembers: Member[] | undefined;
  previousHeatmap: Record<string, number> | undefined;
};

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
      let previousHeatmap: Record<string, number> | undefined;
      if (!userId) return { previousMembers };

      const patch = opts.getPatch(vars);
      queryClient.setQueryData<Member[]>(key, (old) => {
        if (!old) return old;
        return old.map((m) =>
          m.user_id === userId ? { ...m, goals: patch(m.goals, userId) } : m,
        );
      });

      if (opts.getHeatmapDelta) {
        const heatmapKey = ["heatmap", userId];
        await queryClient.cancelQueries({ queryKey: heatmapKey });
        previousHeatmap =
          queryClient.getQueryData<Record<string, number>>(heatmapKey);
        const delta = opts.getHeatmapDelta(vars);
        const today = new Date().toLocaleDateString("en-CA");

        queryClient.setQueryData<Record<string, number>>(heatmapKey, (old) => {
          const current = old || {};
          const currentCount = current[today] || 0;
          return {
            ...current,
            [today]: Math.max(0, currentCount + delta), // max(0) chroni przed ujemnym wynikiem
          };
        });
      }

      return { previousMembers, previousHeatmap };
    },

    onError: (error, vars, context) => {
      const key = queryKeys.groupMembers(opts.getGroupId(vars));
      if (context?.previousMembers) {
        queryClient.setQueryData(key, context.previousMembers);
      }
      if (context?.previousHeatmap && userId) {
        queryClient.setQueryData(["heatmap", userId], context.previousHeatmap);
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
      if (opts.getHeatmapDelta && userId) {
        queryClient.invalidateQueries({ queryKey: ["heatmap", userId] });
      }
    },
  });
}
