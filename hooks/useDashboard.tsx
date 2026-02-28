import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import { useSupabase } from "@/hooks/useSupabase";
import { useRouter } from "expo-router";
import { Goal, Member, GroupResult } from "@/types/dashboardTypes";
import * as Haptics from "expo-haptics";
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
        const lastDate = myGroup.last_streak_date; // Use groupData, not myGroup
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
    [userId],
  );

  const toggleGoal = async (goal: Goal) => {
    if (!userId) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const today = new Date().toISOString().split("T")[0];

    // Determine the new state (Flip the current state)
    const isNowCompleted = !goal.completed_today;

    // 1. Optimistic Update (Update UI instantly)
    setMembers((current) =>
      current.map((m) => {
        if (m.user_id !== userId) return m;
        return {
          ...m,
          goals: m.goals.map((g) =>
            g.id === goal.id ? { ...g, completed_today: isNowCompleted } : g,
          ),
        };
      }),
    );

    // 2. Database Action
    if (isNowCompleted) {
      await supabase.from("logs").insert({
        goal_id: goal.id,
        user_id: userId,
        date: today,
      });
    } else {
      await supabase
        .from("logs")
        .delete()
        .eq("goal_id", goal.id)
        .eq("user_id", userId)
        .eq("date", today);
    }

    // 3. Silent Refresh (Recalculate streak/waiting status)
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

  const deleteGoal = async (goalId: string) => {
    if (!goalId || !userId || !activeGroupId) return;
    const { data, error } = await supabase
      .from("goals")
      .delete()
      .eq("id", goalId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    if (!data || data.length === 0) {
      console.warn("Delete failed: No matching rows found or RLS blocked it.");
      Alert.alert(
        "Error",
        "Could not delete this goal. You might not have permission.",
      );
      return;
    }

    setMembers((current) =>
      current.map((m) => {
        if (m.user_id !== userId) return m;
        return {
          ...m,
          goals: m.goals.filter((g) => g.id !== goalId),
        };
      }),
    );

    await fetchData(true);
  };

  useEffect(() => {
    if (userId) {
      fetchData();
    }
  }, [userId, fetchData]);

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
    deleteGoal,
  };
}
