import { useSupabase } from "@/hooks/useSupabase";
import { useProfile } from "@/hooks/useProfile";
import { useGroupStats } from "@/hooks/useGroupStats";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { Goal } from "@/types/dashboardTypes";

export function useProfileData() {
  const { session, signOut } = useSupabase();
  const userId = session?.user.id;

  const profile = useProfile();
  const groupStats = useGroupStats();
  const groupMembers = useGroupMembers({
    groupId: groupStats.data?.group_id || null,
  });

  const myGoals: Goal[] =
    groupMembers.data?.find((m) => m.user_id === userId)?.goals || [];

  const isLoading =
    profile.isLoading || groupStats.isLoading || groupMembers.isLoading;
  const isError = profile.isError || groupStats.isError || groupMembers.isError;

  const refetch = async () => {
    await Promise.all([
      profile.refetch(),
      groupStats.refetch(),
      groupMembers.refetch(),
    ]);
  };

  return {
    userId,
    nickname: profile.data?.nickname ?? null,
    avatarUrl: profile.data?.avatar_url ?? null,
    email: session?.user.email ?? null,
    memberSince: session?.user.created_at ?? null,
    groupStreak: groupStats.data?.current_streak ?? 0,
    groupName: groupStats.data?.name ?? null,
    groupMemberCount: groupMembers.data?.length ?? 0,
    myGoals,
    isLoading,
    isError,
    refetch,
    signOut,
  };
}
