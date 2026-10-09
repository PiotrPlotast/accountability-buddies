import {
  useMutation,
  useQueryClient,
  UseMutationResult,
} from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "react-native";

import { useSupabase } from "@/hooks/useSupabase";
import { errorMessage } from "@/lib/errorMessage";
import { error as errorHaptic } from "@/lib/haptics";
import { getTodayLocalDate } from "@/lib/date";
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

// `heatmap` is only present when the optimistic patch actually ran. That
// matters because the heatmap patch writes even when nothing was cached
// (`old || {}`), so a plain "previous value was undefined" check can't tell
// "we wrote nothing" from "we invented an entry" — and the second case has to
// be removed on rollback, not left behind in a cache that outlives the app.
type RollbackContext = {
  previousMembers: Member[] | undefined;
  membersKey: readonly unknown[];
  heatmap?: {
    key: readonly unknown[];
    previous: Record<string, number> | undefined;
  };
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

      // Today's entry is the one on screen: the dashboard keys its read by
      // the same local day. Any day's in-flight read is cancelled, so none
      // lands on top of the patch.
      const groupId = opts.getGroupId(vars);
      const key = queryKeys.groupMembers(groupId, getTodayLocalDate());
      await queryClient.cancelQueries({
        queryKey: queryKeys.groupMembersOfGroup(groupId),
      });
      const previousMembers = queryClient.getQueryData<Member[]>(key);
      let heatmap: RollbackContext["heatmap"];
      if (!userId) return { previousMembers, membersKey: key };

      const patch = opts.getPatch(vars);
      queryClient.setQueryData<Member[]>(key, (old) => {
        if (!old) return old;
        return old.map((m) =>
          m.user_id === userId ? { ...m, goals: patch(m.goals, userId) } : m,
        );
      });

      if (opts.getHeatmapDelta) {
        const heatmapKey = queryKeys.heatmap(userId);
        await queryClient.cancelQueries({ queryKey: heatmapKey });
        heatmap = {
          key: heatmapKey,
          previous:
            queryClient.getQueryData<Record<string, number>>(heatmapKey),
        };
        const delta = opts.getHeatmapDelta(vars);
        const today = getTodayLocalDate();

        queryClient.setQueryData<Record<string, number>>(heatmapKey, (old) => {
          const current = old || {};
          const currentCount = current[today] || 0;
          return {
            ...current,
            [today]: Math.max(0, currentCount + delta), // max(0) chroni przed ujemnym wynikiem
          };
        });
      }

      return { previousMembers, membersKey: key, heatmap };
    },

    onError: (error, _vars, context) => {
      // The key the patch went to, not today's: a rollback after midnight
      // belongs to the day the tap was made on.
      if (context?.previousMembers !== undefined) {
        queryClient.setQueryData(context.membersKey, context.previousMembers);
      }
      if (context?.heatmap) {
        const { key: heatmapKey, previous } = context.heatmap;
        if (previous === undefined) {
          // Nothing was cached before the optimistic write, and passing
          // `undefined` to setQueryData is a no-op — drop the entry instead so
          // the next read refetches rather than trusting an invented count.
          queryClient.removeQueries({ queryKey: heatmapKey, exact: true });
        } else {
          queryClient.setQueryData(heatmapKey, previous);
        }
      }
      // Felt before the Alert is read — one buzz for every rollback in the app,
      // because they all come through here.
      errorHaptic();
      Alert.alert("Couldn't save", errorMessage(error));
    },

    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupMembersOfGroup(opts.getGroupId(vars)),
      });
      if (opts.invalidateStatsOnSettle) {
        queryClient.invalidateQueries({ queryKey: queryKeys.groupStatsAll() });
      }
      if (opts.getHeatmapDelta && userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.heatmap(userId) });
      }
    },
  });
}
