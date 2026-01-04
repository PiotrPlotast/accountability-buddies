import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSupabase } from "@/hooks/useSupabase";

export default function JoinGroupScreen() {
  const { supabase, session } = useSupabase();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"JOIN" | "CREATE">("JOIN"); // Toggle between forms

  const handleJoin = async () => {
    if (!code) return Alert.alert("Error", "Please enter a code");
    setLoading(true);

    // Call the SQL function we wrote earlier
    const { data, error } = await supabase.rpc("join_group_via_code", {
      code_input: code.trim(),
    });

    setLoading(false);

    if (error || !data.success) {
      Alert.alert("Failed", data?.message || error?.message || "Invalid code");
    } else {
      Alert.alert("Success!", "You have joined the squad.");
      router.replace("/(tabs)"); // Go back to Dashboard
    }
  };

  const handleCreate = async () => {
    if (!groupName) return Alert.alert("Error", "Name your group");
    setLoading(true);

    const userId = session?.user.id;
    if (!userId) return;

    // 1. Create the Group
    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .insert({
        name: groupName,
        creator_id: userId,
      })
      .select()
      .single();

    if (groupError) {
      setLoading(false);
      return Alert.alert("Error", groupError.message);
    }

    // 2. Add MYSELF as the first member
    const { error: memberError } = await supabase.from("group_members").insert({
      group_id: groupData.id,
      user_id: userId,
    });

    setLoading(false);

    if (memberError) {
      Alert.alert("Error", "Group created but joining failed.");
    } else {
      Alert.alert("Success", `Group "${groupName}" created!`);
      router.replace("/(tabs)");
    }
  };

  return (
    <View className="flex-1 bg-white p-6 justify-center">
      <Text className="text-3xl font-extrabold text-slate-800 text-center mb-2">
        {mode === "JOIN" ? "Join a Squad" : "Start a Squad"}
      </Text>
      <Text className="text-gray-400 text-center mb-10">
        {mode === "JOIN"
          ? "Enter the invite code shared by your friend."
          : "Create a new group and invite your friends."}
      </Text>

      {/* FORM INPUTS */}
      {mode === "JOIN" ? (
        <View className="gap-4">
          <TextInput
            placeholder="e.g. A8X-992"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            className="bg-gray-50 border border-gray-200 p-5 rounded-xl text-center text-2xl font-bold tracking-widest"
          />
          <TouchableOpacity
            onPress={handleJoin}
            disabled={loading}
            className="bg-indigo-600 p-4 rounded-xl items-center shadow-lg shadow-indigo-200"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-lg">Join Group</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View className="gap-4">
          <TextInput
            placeholder="Group Name (e.g. Swole Mates)"
            value={groupName}
            onChangeText={setGroupName}
            className="bg-gray-50 border border-gray-200 p-5 rounded-xl text-lg"
          />
          <TouchableOpacity
            onPress={handleCreate}
            disabled={loading}
            className="bg-slate-900 p-4 rounded-xl items-center shadow-lg"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-lg">Create Group</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* TOGGLE SWITCH */}
      <TouchableOpacity
        onPress={() => setMode(mode === "JOIN" ? "CREATE" : "JOIN")}
        className="mt-6 p-4"
      >
        <Text className="text-indigo-600 text-center font-semibold">
          {mode === "JOIN"
            ? "No code? Create a new group"
            : "Have a code? Join instead"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
