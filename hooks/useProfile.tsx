import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";
import { ProfileRow } from "@/types/dashboardTypes";
import { queryKeys } from "@/lib/queryKeys";

export function useProfile() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;

  return useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: async (): Promise<ProfileRow | null> => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("nickname, avatar_url")
        .eq("id", userId)
        .single<ProfileRow>();

      if (error) {
        console.log("PROFILE ERROR:", error);
        throw error;
      }

      return data;
    },
    enabled: !!userId,
  });
}
