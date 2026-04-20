import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";
import { GroupResult } from "@/types/dashboardTypes";
import { queryKeys } from "@/lib/queryKeys";

export function useGroupStats() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;

  return useQuery({
    queryKey: queryKeys.groupStats(userId),
    queryFn: async (): Promise<GroupResult | null> => {
      if (!userId) return null;

      const { data, error } = await supabase
        .rpc("get_my_group_stats")
        .single<GroupResult>();

      if (error) {
        console.log("RPC ERROR:", error);
        throw error;
      }

      return data;
    },
    enabled: !!userId,
  });
}
