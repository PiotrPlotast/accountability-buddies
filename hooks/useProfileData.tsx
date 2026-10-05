import { useSupabase } from "@/hooks/useSupabase";
import { useProfile } from "@/hooks/useProfile";
import { useActiveGroup } from "@/hooks/useActiveGroup";

export function useProfileData() {
  const { session, signOut } = useSupabase();

  const profile = useProfile();
  const group = useActiveGroup();

  const refetch = async () => {
    await Promise.all([profile.refetch(), group.refetch()]);
  };

  return {
    userId: group.userId,
    fullName: profile.data?.full_name ?? null,
    avatarUrl: profile.data?.avatar_url ?? null,
    email: session?.user.email ?? null,
    memberSince: session?.user.created_at ?? null,
    groupStreak: group.streak,
    groupName: group.groupName,
    groupMemberCount: group.members.length,
    myGoals: group.myGoals,
    isLoading: profile.isLoading || group.loading,
    isError: profile.isError || group.isError,
    refetch,
    signOut,
  };
}
