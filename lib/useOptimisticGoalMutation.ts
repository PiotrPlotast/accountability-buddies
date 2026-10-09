import {
  MutationOptions,
  onlineManager,
  QueryClient,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "react-native";

import { useSupabase } from "@/hooks/useSupabase";
import { errorMessage } from "@/lib/errorMessage";
import { error as errorHaptic } from "@/lib/haptics";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { reportSyncFailure } from "@/lib/syncFailures";
import { Goal, Member } from "@/types/dashboardTypes";

type PatchMyGoals = (goals: Goal[], userId: string) => Goal[];

/** Every goal mutation's key starts with this; `["goal", kind]` in full. */
export const GOAL_MUTATION_KEY = ["goal"] as const;

/**
 * One queue for every change to your habits, so they reach the server in the
 * order they were made: a tick on a habit created offline must not overtake
 * the create.
 */
const GOAL_MUTATION_SCOPE = { id: "goals" };

/**
 * What a mutation stores. Everything the request needs is in here, captured at
 * the tap, because a change made offline runs later — possibly after the app
 * was closed and reopened, with nothing but these variables to go on. So it
 * must survive `JSON.stringify` and carry the user it was made by.
 */
export type StoredVars = { userId: string };

export interface GoalMutationSpec<
  TVars,
  TStored extends StoredVars,
  TData = unknown,
> {
  kind: string;
  /** Turn what the caller passed into what is stored and sent. */
  prepare: (vars: TVars, userId: string) => TStored;
  mutationFn: (vars: TStored, supabase: SupabaseClient) => Promise<TData>;
  getGroupId: (vars: TStored) => string;
  getPatch: (vars: TStored) => PatchMyGoals;
  /** `Ticking "Run"` — names the change in the pop-up when a sync fails. */
  describe: (vars: TStored) => string;
  /** A friendlier reason than the server's, when there is one. */
  explain?: (error: unknown) => string | null;
  invalidateStatsOnSettle?: boolean;
  getHeatmapDelta?: (vars: TStored) => number;
}

// `heatmap` is only present when the optimistic patch actually ran. That
// matters because the heatmap patch writes even when nothing was cached
// (`old || {}`), so a plain "previous value was undefined" check can't tell
// "we wrote nothing" from "we invented an entry" — and the second case has to
// be removed on rollback, not left behind in a cache that outlives the app.
//
// `queued` is "made while offline". It is persisted with the mutation, so a
// change restored after a restart still knows.
type RollbackContext = {
  previousMembers: Member[] | undefined;
  membersKey: readonly unknown[];
  heatmap?: {
    key: readonly unknown[];
    previous: Record<string, number> | undefined;
  };
  queued: boolean;
};

export function goalMutationKey(kind: string) {
  return [...GOAL_MUTATION_KEY, kind];
}

/**
 * The mutation's whole lifecycle — request, optimistic patch, rollback,
 * invalidation — as defaults on the client rather than options on a hook. A
 * change queued offline and restored after a restart has no component behind
 * it; the client finds all of this by its key.
 */
export function goalMutationOptions<TVars, TStored extends StoredVars, TData>(
  queryClient: QueryClient,
  getSupabase: () => SupabaseClient,
  spec: GoalMutationSpec<TVars, TStored, TData>,
): MutationOptions<TData, unknown, TStored, RollbackContext> {
  return {
    mutationKey: goalMutationKey(spec.kind),
    scope: GOAL_MUTATION_SCOPE,
    mutationFn: (vars) => spec.mutationFn(vars, getSupabase()),

    onMutate: async (vars) => {
      const queued = !onlineManager.isOnline();
      const { userId } = vars;

      // Today's entry is the one on screen: the dashboard keys its read by
      // the same local day. Any day's in-flight read is cancelled, so none
      // lands on top of the patch.
      const groupId = spec.getGroupId(vars);
      const key = queryKeys.groupMembers(groupId, getTodayLocalDate());
      await queryClient.cancelQueries({
        queryKey: queryKeys.groupMembersOfGroup(groupId),
      });
      const previousMembers = queryClient.getQueryData<Member[]>(key);
      let heatmap: RollbackContext["heatmap"];

      const patch = spec.getPatch(vars);
      queryClient.setQueryData<Member[]>(key, (old) => {
        if (!old) return old;
        return old.map((m) =>
          m.user_id === userId ? { ...m, goals: patch(m.goals, userId) } : m,
        );
      });

      if (spec.getHeatmapDelta) {
        const heatmapKey = queryKeys.heatmap(userId);
        await queryClient.cancelQueries({ queryKey: heatmapKey });
        heatmap = {
          key: heatmapKey,
          previous:
            queryClient.getQueryData<Record<string, number>>(heatmapKey),
        };
        const delta = spec.getHeatmapDelta(vars);
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

      return { previousMembers, membersKey: key, heatmap, queued };
    },

    onError: (error, vars, context) => {
      // A change made offline and refused on sync. Its snapshot is older than
      // every change queued after it, so replaying it would undo those too;
      // the invalidation below reads the truth back instead. Reported, not
      // alerted: a reconnect can fail several at once, and they share one
      // pop-up.
      if (context?.queued) {
        reportSyncFailure(
          spec.describe(vars),
          spec.explain?.(error) ?? errorMessage(error),
        );
        return;
      }
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
        queryKey: queryKeys.groupMembersOfGroup(spec.getGroupId(vars)),
      });
      if (spec.invalidateStatsOnSettle) {
        queryClient.invalidateQueries({ queryKey: queryKeys.groupStatsAll() });
      }
      if (spec.getHeatmapDelta) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.heatmap(vars.userId),
        });
      }
    },
  };
}

type GoalMutationResult<TVars, TStored, TData> = Omit<
  UseMutationResult<TData, unknown, TStored, RollbackContext>,
  "mutate" | "mutateAsync"
> & {
  mutate: (vars: TVars) => void;
  /**
   * Resolves once the server has it — or, offline, as soon as it is queued:
   * a form that awaits its save would otherwise stay open until the phone
   * reconnects. A queued change that later fails is reported by
   * `lib/syncFailures.ts`, not by this promise.
   */
  mutateAsync: (vars: TVars) => Promise<TData | undefined>;
};

/**
 * A goal mutation for a component. The request and the cache work are the
 * client's defaults (`lib/goalMutationDefaults.ts`); this adds the user, the
 * haptic for the tap — which has to stay with the tap, not the replay — and
 * the offline-aware `mutateAsync`.
 */
export function useOptimisticGoalMutation<
  TVars,
  TStored extends StoredVars,
  TData = unknown,
>(
  spec: GoalMutationSpec<TVars, TStored, TData>,
  beforeOptimistic?: (vars: TVars) => void,
): GoalMutationResult<TVars, TStored, TData> {
  const { session } = useSupabase();
  const userId = session?.user.id;
  const mutation = useMutation<TData, unknown, TStored, RollbackContext>({
    mutationKey: goalMutationKey(spec.kind),
  });

  const mutate = (vars: TVars) => {
    if (!userId) return;
    beforeOptimistic?.(vars);
    mutation.mutate(spec.prepare(vars, userId));
  };

  const mutateAsync = (vars: TVars) => {
    if (!userId) return Promise.reject(new Error("No user"));
    beforeOptimistic?.(vars);
    const result = mutation.mutateAsync(spec.prepare(vars, userId));
    if (onlineManager.isOnline()) return result;
    result.catch(() => {});
    return Promise.resolve(undefined);
  };

  return { ...mutation, mutate, mutateAsync };
}
