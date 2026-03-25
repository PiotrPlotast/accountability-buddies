import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";
import { Member, GroupMemberRow, GoalRow } from "@/types/dashboardTypes";

interface UseGroupMembersProps {
  groupId: string | null;
}

export function useGroupMembers({ groupId }: UseGroupMembersProps) {
  const { supabase } = useSupabase();

  return useQuery({
    queryKey: ["groupMembers", groupId],
    queryFn: async (): Promise<Member[]> => {
      if (!groupId) return [];

      const today = new Date().toLocaleDateString("en-CA");

      const [membersRes, goalsRes] = await Promise.all([
        supabase
          .from<GroupMemberRow>("group_members")
          .select("user_id, profiles(full_name)")
          .eq("group_id", groupId),
        supabase
          .from<GoalRow>("goals")
          .select("id,user_id,title,group_id,logs(id)")
          .eq("group_id", groupId)
          .eq("logs.date", today),
      ]);

      if (!membersRes.data || !goalsRes.data) return [];

      const formattedMembers: Member[] = membersRes.data.map((m) => ({
        user_id: m.user_id,
        full_name: m.profiles?.full_name || "Unknown",
        goals: goalsRes.data
          .filter((g) => g.user_id === m.user_id)
          .map((g) => ({ ...g, completed_today: g.logs.length > 0 })),
      }));

      return formattedMembers;
    },
    enabled: !!groupId,
  });
}
