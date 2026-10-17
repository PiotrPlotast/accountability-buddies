import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useProfile } from "@/hooks/useProfile";
import { useSupabase } from "@/hooks/useSupabase";
import { hasDisplayName } from "@/lib/displayName";
import { queryKeys } from "@/lib/queryKeys";
import { markTourSeenLocally, wasTourSeenLocally } from "@/lib/tour";
import { ProfileRow } from "@/types/dashboardTypes";

function useTourSeenLocally() {
  const { session } = useSupabase();
  const userId = session?.user.id;
  return useQuery({
    queryKey: queryKeys.tourSeenLocally(userId),
    queryFn: () => (userId ? wasTourSeenLocally(userId) : false),
    enabled: !!userId,
  });
}

/**
 * Whether the signed-in user still owes the first-run tour.
 *
 * `(protected)/_layout.tsx` guards on `needsTour` the way it guards on the
 * name, so the tour sits between the name screen and join-group. Only an
 * explicit `null` counts as "never seen": a profile cached before the column
 * existed has no key at all, and existing accounts were all marked as seen,
 * so treating that as unseen would flash the tour at every one of them.
 */
export function useTourGate() {
  const { data: profile, isFetched } = useProfile();
  const local = useTourSeenLocally();

  const isResolved = isFetched && local.isFetched;
  return {
    isResolved,
    needsTour:
      isResolved &&
      hasDisplayName(profile) &&
      profile?.tour_seen_at === null &&
      !local.data,
  };
}

function useWriteTourSeen() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("No user");
      const { error } = await supabase
        .from("profiles")
        .update({ tour_seen_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw error;
    },
    // No rollback and no Alert: the tour stays dismissed on this phone either
    // way, and `useTourSeenSync` retries on the next launch.
  });
}

/**
 * Dismiss the tour: on this phone at once, then on the account. A replay by
 * someone who has already seen it writes nothing.
 */
export function useCompleteTour() {
  const { session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const write = useWriteTourSeen();
  const { mutate } = write;

  return useCallback(() => {
    if (!userId) return;
    const profileKey = queryKeys.profile(userId);
    const profile = queryClient.getQueryData<ProfileRow | null>(profileKey);
    if (profile?.tour_seen_at) return;

    queryClient.setQueryData(queryKeys.tourSeenLocally(userId), true);
    void markTourSeenLocally(userId);
    if (profile) {
      queryClient.setQueryData<ProfileRow>(profileKey, {
        ...profile,
        tour_seen_at: new Date().toISOString(),
      });
    }
    mutate(undefined, {
      onSettled: () => queryClient.invalidateQueries({ queryKey: profileKey }),
    });
  }, [userId, queryClient, mutate]);
}

/**
 * Tell the server about a tour dismissed while it couldn't hear. Mounted once,
 * in `(protected)/_layout.tsx`; sends at most one write per launch.
 */
export function useTourSeenSync() {
  const { data: profile } = useProfile();
  const local = useTourSeenLocally();
  const { mutate } = useWriteTourSeen();
  const sent = useRef(false);

  const missed = local.data === true && profile?.tour_seen_at === null;
  useEffect(() => {
    if (!missed || sent.current) return;
    sent.current = true;
    mutate();
  }, [missed, mutate]);
}
