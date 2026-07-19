import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";

export function useHeatmapData(userId?: string) {
  const { supabase } = useSupabase();

  return useQuery({
    queryKey: ["heatmap", userId],
    queryFn: async () => {
      if (!userId) return {};

      const { data, error } = await supabase.rpc("get_heatmap_logs", {
        p_user_id: userId,
      });
      if (error) {
        console.error("Heatmap RPC error:", error);
        throw error;
      }
      const heatmapDict: Record<string, number> = {};
      data?.forEach((row) => {
        if (row.log_date) {
          heatmapDict[row.log_date] = row.completed_count;
        }
      });

      return heatmapDict;
    },
    enabled: !!userId,
  });
}
