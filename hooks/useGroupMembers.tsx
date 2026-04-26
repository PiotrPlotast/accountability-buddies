import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";
import { Member } from "@/types/dashboardTypes";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";

interface UseGroupMembersProps {
  groupId: string | null;
}

export function useGroupMembers({ groupId }: UseGroupMembersProps) {
  const { supabase } = useSupabase();

  return useQuery({
    queryKey: queryKeys.groupMembers(groupId),
    queryFn: async (): Promise<Member[]> => {
      if (!groupId) return [];

      const today = getTodayLocalDate();

      const [membersRes, goalsRes] = await Promise.all([
        supabase
          .from("group_members")
          .select("user_id, profiles(full_name)")
          .eq("group_id", groupId),
        supabase
          .from("goals")
          .select("id,user_id,title,group_id,icon,repeat_days,logs(id)")
          .eq("group_id", groupId)
          .eq("logs.date", today),
      ]);

      if (!membersRes.data || !goalsRes.data) return [];

      const formattedMembers: Member[] = membersRes.data.map((m) => {
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        return {
          user_id: m.user_id,
          full_name: profile?.full_name || "Unknown",
          goals: goalsRes.data
            .filter((g) => g.user_id === m.user_id)
            .map((g) => ({ ...g, completed_today: g.logs.length > 0 })),
        };
      });

      return formattedMembers;
    },
    enabled: !!groupId,
  });
}
