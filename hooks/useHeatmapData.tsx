import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";
import { queryKeys } from "@/lib/queryKeys";

// Shape returned by the `get_heatmap_logs` RPC: one row per day that has logs.
type HeatmapRow = {
  log_date: string | null;
  completed_count: number;
};

export function useHeatmapData(userId?: string) {
  const { supabase } = useSupabase();

  return useQuery({
    queryKey: queryKeys.heatmap(userId),
    queryFn: async (): Promise<Record<string, number>> => {
      if (!userId) return {};

      const { data, error } = await supabase.rpc("get_heatmap_logs", {
        p_user_id: userId,
      });
      if (error) throw error;

      const heatmapDict: Record<string, number> = {};
      (data as HeatmapRow[] | null)?.forEach((row) => {
        if (row.log_date) {
          heatmapDict[row.log_date] = row.completed_count;
        }
      });

      return heatmapDict;
    },
    enabled: !!userId,
  });
}
