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
        // maybeSingle: a freshly signed-up user may not have a profile row
        // yet, which is a null result rather than a failure.
        .maybeSingle<ProfileRow>();

      if (error) throw error;

      return data;
    },
    enabled: !!userId,
  });
}
