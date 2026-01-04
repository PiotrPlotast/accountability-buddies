import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
  Keyboard,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSupabase } from "@/hooks/useSupabase";
import { useRouter } from "expo-router";

type Goal = {
  id: string;
  title: string;
  user_id: string;
  completed_today: boolean;
};

type Member = {
  user_id: string;
  full_name: string;
  goals: Goal[];
};

export default function Dashboard() {
  const { session, supabase } = useSupabase();
  const userId = session?.user.id;
  const router = useRouter();

  // Data State
  const [groupName, setGroupName] = useState<string>("Loading...");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string>("");
  const [streak, setStreak] = useState<number>(0);
  const [members, setMembers] = useState<Member[]>([]);

  // UI State
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  useEffect(() => {
    if (userId) fetchData();
  }, [userId]);

  const fetchData = async (forceRefresh = false) => {
    if (!userId) return;
    if (!forceRefresh) setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    // A. Get My Group (Added 'last_streak_date')
    const { data: myGroup } = await supabase
      .from("group_members")
      .select(
        "group_id, groups(name, current_streak, invite_code, last_streak_date)"
      )
      .eq("user_id", userId)
      .single();

    if (!myGroup) {
      setLoading(false);
      router.replace("/(protected)/join-group");
      return;
    }

    setGroupName(myGroup.groups?.name || "My Group");
    setStreak(myGroup.groups?.current_streak || 0);
    setInviteCode(myGroup.groups?.invite_code || "");
    setActiveGroupId(myGroup.group_id);

    // B. Get Members
    const { data: memberData } = await supabase
      .from("group_members")
      .select("user_id, profiles(full_name)")
      .eq("group_id", myGroup.group_id);

    // C. Get Goals
    const { data: goalsData } = await supabase
      .from("goals")
      .select("*, logs(id)")
      .eq("group_id", myGroup.group_id)
      .eq("logs.date", today);

    // D. Format Data & Calculate Status
    if (memberData && goalsData) {
      const formattedMembers = memberData.map((m: any) => ({
        user_id: m.user_id,
        full_name: m.profiles?.full_name || "Unknown",
        goals: goalsData
          .filter((g: any) => g.user_id === m.user_id)
          .map((g: any) => ({
            ...g,
            completed_today: g.logs.length > 0,
          })),
      }));

      // Check if streak is NOT updated today
      const lastDate = myGroup.groups?.last_streak_date;
      const streakNotUpdatedToday = lastDate !== today;

      // Check if *I* have contributed today
      const myData = formattedMembers.find((m: any) => m.user_id === userId);
      const iHaveContributed = myData?.goals.some(
        (g: any) => g.completed_today
      );

      // If I did my part, but the streak date is old, I am waiting for others.
      setIsWaiting(!!(streakNotUpdatedToday && iHaveContributed));

      setMembers(formattedMembers);
      if (!selectedTabId) setSelectedTabId(userId);
    }
    if (!forceRefresh) setLoading(false);
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert("Copied!", `Code ${inviteCode} copied to clipboard.`);
  };

  // --- NEW FUNCTION: ADD GOAL ---
  const handleAddGoal = async () => {
    if (!newGoalTitle.trim() || !userId || !activeGroupId) return;
    setIsAdding(true);

    // 1. Insert into Supabase
    const { data, error } = await supabase
      .from("goals")
      .insert({
        title: newGoalTitle.trim(),
        user_id: userId,
        group_id: activeGroupId, // <--- Critical: Link to Group
      })
      .select()
      .single();

    if (error) {
      Alert.alert("Error", error.message);
      setIsAdding(false);
      return;
    }

    // 2. Optimistic Update (Show it instantly)
    setMembers((current) =>
      current.map((m) => {
        if (m.user_id !== userId) return m;
        return {
          ...m,
          goals: [...m.goals, { ...data, completed_today: false }], // Add new goal to list
        };
      })
    );

    // 3. Reset
    setNewGoalTitle("");
    Keyboard.dismiss();
    setIsAdding(false);
  };

  const toggleGoal = async (goal: Goal) => {
    if (!userId) return;
    const today = new Date().toISOString().split("T")[0];
    if (goal.completed_today) return;

    setMembers((current) =>
      current.map((m) => {
        if (m.user_id !== userId) return m;
        return {
          ...m,
          goals: m.goals.map((g) =>
            g.id === goal.id ? { ...g, completed_today: true } : g
          ),
        };
      })
    );

    await supabase
      .from("logs")
      .insert({ goal_id: goal.id, user_id: userId, date: today });

    await fetchData(true);
  };

  if (!userId) return <View />;

  const currentMember = members.find((m) => m.user_id === selectedTabId);
  const isViewingMe = selectedTabId === userId;

  return (
    <View className="flex-1 bg-white">
      {/* HEADER */}
      <View className="pt-14 pb-6 px-6 bg-slate-900">
        <View className="flex-row justify-between items-start">
          <View>
            <Text className="text-gray-400 text-xs font-bold tracking-widest uppercase mb-1">
              {groupName}
            </Text>
            <TouchableOpacity
              onPress={handleCopy}
              className="bg-indigo-600 px-3 py-1 rounded-full self-start flex-row items-center mt-1"
            >
              <Text className="text-white text-xs font-bold mr-1">
                Invite: {inviteCode}
              </Text>
              <Text className="text-white text-xs">📋</Text>
            </TouchableOpacity>
          </View>
          <View className="items-end">
            <Text className="text-white text-3xl font-bold">Day {streak}</Text>
            <Text className="text-3xl">{isWaiting ? "⏳" : "🔥"}</Text>
          </View>
        </View>
      </View>

      {/* TABS */}
      <View className="flex-row border-b border-gray-100">
        {members.map((member) => (
          <TouchableOpacity
            key={member.user_id}
            onPress={() => setSelectedTabId(member.user_id)}
            className={`flex-1 p-4 items-center border-b-2 ${
              member.user_id === selectedTabId
                ? "border-indigo-600"
                : "border-transparent"
            }`}
          >
            <Text
              className={`font-bold ${member.user_id === selectedTabId ? "text-indigo-600" : "text-gray-400"}`}
            >
              {member.user_id === userId
                ? "YOU"
                : member.full_name.split(" ")[0]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* LIST */}
      <ScrollView
        className="flex-1 p-4"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchData} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* --- ADD GOAL INPUT (Only visible on MY tab) --- */}
        {isViewingMe && (
          <View className="flex-row gap-2 mb-4">
            <TextInput
              placeholder="+ Add a new habit..."
              value={newGoalTitle}
              onChangeText={setNewGoalTitle}
              onSubmitEditing={handleAddGoal} // Saves when you hit 'Return'
              className="flex-1 bg-gray-50 border border-gray-200 p-4 rounded-xl text-base"
            />
            {newGoalTitle.length > 0 && (
              <TouchableOpacity
                onPress={handleAddGoal}
                disabled={isAdding}
                className="bg-slate-900 justify-center px-5 rounded-xl"
              >
                <Text className="text-white font-bold">
                  {isAdding ? "..." : "Add"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* --- GOALS LIST --- */}
        {currentMember?.goals.map((goal) => (
          <TouchableOpacity
            key={goal.id}
            disabled={!isViewingMe || goal.completed_today}
            onPress={() => toggleGoal(goal)}
            className={`p-5 mb-3 rounded-xl border flex-row items-center justify-between ${
              goal.completed_today
                ? isViewingMe
                  ? "bg-green-50 border-green-500"
                  : "bg-indigo-50 border-indigo-200"
                : "bg-white border-slate-200 shadow-sm"
            }`}
          >
            <Text
              className={`text-lg font-medium ${
                goal.completed_today
                  ? isViewingMe
                    ? "text-green-800"
                    : "text-indigo-800"
                  : isViewingMe
                    ? "text-slate-800"
                    : "text-gray-400"
              }`}
            >
              {goal.title}
            </Text>
            {goal.completed_today && (
              <Text className="text-xl">{isViewingMe ? "✅" : "🔥"}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* Empty State Hint */}
        {currentMember?.goals.length === 0 && !newGoalTitle && (
          <Text className="text-center text-gray-300 mt-10 italic">
            {isViewingMe
              ? "Add your first habit above!"
              : "Waiting for them to add habits..."}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
