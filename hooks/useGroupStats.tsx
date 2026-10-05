import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOnValueChange } from "@/hooks/useOnValueChange";
import { useSupabase } from "@/hooks/useSupabase";
import { useTodayLocalDate } from "@/hooks/useTodayLocalDate";
import { GroupResult } from "@/types/dashboardTypes";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";

export function useGroupStats() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  // The streak is judged against `p_today`, so the answer goes stale the
  // moment the local day changes. Not keyed by day like `groupMembers`: the
  // group id lives in this answer, and a new key with nothing in it would
  // read as "no group" until the fetch landed.
  useOnValueChange(useTodayLocalDate(), () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.groupStats(userId) });
  });

  return useQuery({
    queryKey: queryKeys.groupStats(userId),
    queryFn: async (): Promise<GroupResult | null> => {
      if (!userId) return null;

      // maybeSingle: a user with no group is an expected state (the dashboard
      // redirects them to join-group), not a PGRST116 "no rows" error.
      //
      // `p_today` is our local date, the same one `logs.date` is written
      // with. Left to itself the server judges a streak stale against its UTC
      // date, which is already tomorrow every evening west of UTC.
      const { data, error } = await supabase
        .rpc("get_my_group_stats", { p_today: getTodayLocalDate() })
        .maybeSingle<GroupResult>();

      if (error) throw error;

      return data;
    },
    enabled: !!userId,
  });
}
