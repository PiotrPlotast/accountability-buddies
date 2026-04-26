import "../../global.css";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSupabase } from "@/hooks/useSupabase";

export default function JoinGroupScreen() {
  const { supabase, session } = useSupabase();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"JOIN" | "CREATE">("JOIN");

  const handleJoin = async () => {
    if (!code) return Alert.alert("Error", "Please enter a code");
    setLoading(true);

    const { data, error } = await supabase.rpc("join_group_via_code", {
      code_input: code.trim(),
    });

    setLoading(false);

    if (error || !data?.success) {
      Alert.alert("Failed", data?.message || error?.message || "Invalid code");
    } else {
      router.replace("/");
    }
  };

  const handleCreate = async () => {
    if (!groupName) return Alert.alert("Error", "Name your group");
    setLoading(true);

    const userId = session?.user.id;
    if (!userId) return;

    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .insert({ name: groupName, creator_id: userId })
      .select()
      .single();

    if (groupError) {
      setLoading(false);
      return Alert.alert("Error", groupError.message);
    }

    const { error: memberError } = await supabase.from("group_members").insert({
      group_id: groupData.id,
      user_id: userId,
    });

    setLoading(false);

    if (memberError) {
      Alert.alert("Error", "Group created but joining failed.");
    } else {
      router.replace("/");
    }
  };

  const isJoin = mode === "JOIN";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0B0C" }}>
      <View className="flex-1 px-6 justify-center">
        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
          Step 01 / 01
        </Text>
        <Text
          className="text-text font-mono-bold"
          style={{ fontSize: 32, lineHeight: 36 }}
        >
          {isJoin ? "Join a crew." : "Start a crew."}
        </Text>
        <Text className="text-text-muted font-mono text-sm mt-3">
          {isJoin
            ? "Paste the invite code your buddy shared."
            : "Name your group. You can invite people after."}
        </Text>

        <View className="mt-8 gap-3">
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest">
            {isJoin ? "Invite code" : "Group name"}
          </Text>
          {isJoin ? (
            <View className="border-2 border-neon rounded-tile px-4 h-16 justify-center bg-bg">
              <TextInput
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                placeholder="A8X-992"
                placeholderTextColor="#6B7280"
                className="text-text text-2xl text-center tracking-widest"
                style={{ fontFamily: "GeistMono_700Bold" }}
              />
            </View>
          ) : (
            <View className="border-2 border-neon rounded-tile px-4 h-14 justify-center bg-bg">
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Swole Mates"
                placeholderTextColor="#6B7280"
                className="text-text text-base"
                style={{ fontFamily: "GeistMono_400Regular" }}
              />
            </View>
          )}

          <Pressable
            onPress={isJoin ? handleJoin : handleCreate}
            disabled={loading}
            className="h-14 rounded-tile items-center justify-center bg-neon mt-2"
          >
            {loading ? (
              <ActivityIndicator color="#0B0B0C" />
            ) : (
              <Text className="text-bg font-mono-bold">
                {isJoin ? "Join group" : "Create group"}
              </Text>
            )}
          </Pressable>
        </View>

        <Pressable
          onPress={() => setMode(isJoin ? "CREATE" : "JOIN")}
          className="mt-8 items-center"
        >
          <Text className="text-neon font-mono-medium text-sm">
            {isJoin
              ? "No code? Create a new group"
              : "Have a code? Join instead"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
