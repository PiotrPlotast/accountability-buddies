import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import { useSupabase } from "@/hooks/useSupabase";
import { useRouter } from "expo-router";
import { Goal, Member, GroupResult } from "@/types/dashboardTypes";

export function useDashboard() {
  const { session, supabase } = useSupabase();
  const userId = session?.user.id;
  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
  const [groupName, setGroupName] = useState<string>("Loading...");
  const [streak, setStreak] = useState<number>(0);
  const [inviteCode, setInviteCode] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!userId) return;
      if (!forceRefresh) setLoading(true);

      const today = new Date().toISOString().split("T")[0];

      const { data: myGroup, error } = await supabase
        .rpc("get_my_group_stats")
        .single<GroupResult>();

      if (error) console.log("RPC ERROR:", error);
      if (!myGroup) console.log("RPC DATA IS NULL (User has no group)");
      if (error || !myGroup) {
        router.replace("/(protected)/join-group");
        return;
      }

      setGroupName(myGroup.name || "My Group");
      setStreak(myGroup.current_streak || 0);
      setInviteCode(myGroup.invite_code || "");
      setActiveGroupId(myGroup.group_id);

      const [membersRes, goalsRes] = await Promise.all([
        supabase
          .from("group_members")
          .select("user_id, profiles(full_name)")
          .eq("group_id", myGroup.group_id),
        supabase
          .from("goals")
          .select("*, logs(id)")
          .eq("group_id", myGroup.group_id)
          .eq("logs.date", today),
      ]);

      if (membersRes.data && goalsRes.data) {
        const formattedMembers = membersRes.data.map((m: any) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name || "Unknown",
          goals: goalsRes.data
            .filter((g: any) => g.user_id === m.user_id)
            .map((g: any) => ({ ...g, completed_today: g.logs.length > 0 })),
        }));

        const lastDate = myGroup.groups?.last_streak_date;
        const serverStreak = myGroup.groups?.current_streak || 0;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        // The Rule: Streak is valid ONLY if updated Today or Yesterday.
        // If last_streak_date is older than yesterday, it's broken.
        const isStreakAlive = lastDate === today || lastDate === yesterdayStr;
        const realStreak = isStreakAlive ? serverStreak : 0;
        setStreak(realStreak);

        const streakNotUpdatedToday = lastDate !== today;
        const myData = formattedMembers.find((m: any) => m.user_id === userId);
        const iHaveContributed = myData?.goals.some(
          (g: any) => g.completed_today,
        );

        setIsWaiting(!!(streakNotUpdatedToday && iHaveContributed));
        setMembers(formattedMembers);
      }

      if (!forceRefresh) setLoading(false);
    },
    [userId, router, supabase],
  );

  // Actions
  const toggleGoal = async (goal: Goal) => {
    if (!userId) return;
    const today = new Date().toISOString().split("T")[0];
    if (goal.completed_today) return;

    // Optimistic Update
    setMembers((current) =>
      current.map((m) => {
        if (m.user_id !== userId) return m;
        return {
          ...m,
          goals: m.goals.map((g) =>
            g.id === goal.id ? { ...g, completed_today: true } : g,
          ),
        };
      }),
    );

    await supabase
      .from("logs")
      .insert({ goal_id: goal.id, user_id: userId, date: today });
    await fetchData(true);
  };

  const addGoal = async (title: string) => {
    if (!title.trim() || !userId || !activeGroupId) return;
    const { data, error } = await supabase
      .from("goals")
      .insert({ title: title.trim(), user_id: userId, group_id: activeGroupId })
      .select()
      .single();

    if (error) Alert.alert("Error", error.message);
    else {
      // Optimistic add
      setMembers((current) =>
        current.map((m) => {
          if (m.user_id !== userId) return m;
          return {
            ...m,
            goals: [...m.goals, { ...data, completed_today: false }],
          };
        }),
      );
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    userId,
    loading,
    groupName,
    streak,
    inviteCode,
    members,
    isWaiting,
    fetchData,
    toggleGoal,
    addGoal,
  };
}
