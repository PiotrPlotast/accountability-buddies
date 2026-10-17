import { useSupabase } from "@/hooks/useSupabase";
import { useProfile } from "@/hooks/useProfile";
import { useActiveGroup } from "@/hooks/useActiveGroup";

export function useProfileData() {
  const { session } = useSupabase();

  const profile = useProfile();
  const group = useActiveGroup();

  return {
    userId: group.userId,
    fullName: profile.data?.full_name ?? null,
    avatarUrl: profile.data?.avatar_url ?? null,
    memberSince: session?.user.created_at ?? null,
    groupStreak: group.streak,
    groupName: group.groupName,
    groupMemberCount: group.members.length,
    myGoals: group.myGoals,
  };
}
