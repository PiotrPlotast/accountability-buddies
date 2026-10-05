import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useActiveGroup } from "@/hooks/useActiveGroup";
import { useNameGate } from "@/hooks/useNameGate";

/**
 * The dashboard screen's own layer over `useActiveGroup`: the pull-to-refresh
 * state and the join-group redirect. Called from `Dashboard` only — every
 * other component reads `useActiveGroup` directly, so there is exactly one
 * redirect effect and one `refreshing` flag.
 */
export function useDashboardData() {
  const router = useRouter();
  const group = useActiveGroup();
  const { refetch, hasNoGroup } = group;

  // Bound to the explicit refresh gesture rather than the queries' own
  // `isRefetching`, which also flips on background invalidation (every goal
  // toggle invalidates `groupMembers`) and would spin the control unprompted.
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Redirect if no group — but never ahead of the name gate. A brand new
  // account has neither a name nor a group, and both answers arrive from
  // separate round trips, so whichever resolved last used to win. The name
  // screen owns that user; this waits for a name before sending anyone
  // anywhere. `(protected)/_layout.tsx` normally keeps the dashboard
  // unmounted in that state, which leaves this covering the window before the
  // profile has been read.
  const { isResolved: nameResolved, needsName } = useNameGate();

  useEffect(() => {
    if (!nameResolved || needsName) return;
    if (hasNoGroup) {
      router.replace("/(protected)/join-group");
    }
  }, [hasNoGroup, nameResolved, needsName, router]);

  return { ...group, refreshing, fetchData };
}
