import "../../global.css";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSupabase } from "@/hooks/useSupabase";
import { themeColors } from "@/lib/colors";
export default function JoinGroupScreen() {
  const { supabase, session } = useSupabase();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"JOIN" | "CREATE">("JOIN");

  const handleJoin = async () => {
    if (loading) return;
    if (!code.trim()) return Alert.alert("Error", "Please enter a code");
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("join_group_via_code", {
        code_input: code.trim(),
      });

      if (error || !data?.success) {
        Alert.alert(
          "Failed",
          data?.message || error?.message || "Invalid code",
        );
        return;
      }
      router.replace("/");
    } catch (err) {
      Alert.alert(
        "Failed",
        err instanceof Error ? err.message : "Could not join the group.",
      );
    } finally {
      setLoading(false);
    }
  };

  // NOTE: creating the group and joining it are two round trips, so a failure
  // between them leaves a group nobody is a member of. Making this atomic needs
  // a `create_group_and_join` RPC alongside `join_group_via_code`; until that
  // exists the best we can do is report the half-finished state honestly.
  const handleCreate = async () => {
    if (loading) return;
    const trimmedName = groupName.trim();
    if (!trimmedName) return Alert.alert("Error", "Name your group");

    const userId = session?.user.id;
    if (!userId) return Alert.alert("Error", "You are not signed in.");

    setLoading(true);
    try {
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .insert({ name: trimmedName, creator_id: userId })
        .select()
        .single();

      if (groupError) return Alert.alert("Error", groupError.message);

      const { error: memberError } = await supabase
        .from("group_members")
        .insert({ group_id: groupData.id, user_id: userId });

      if (memberError) {
        return Alert.alert(
          "Error",
          `"${trimmedName}" was created but you couldn't be added to it. Try joining with its invite code, or contact support.`,
        );
      }
      router.replace("/");
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not create the group.",
      );
    } finally {
      setLoading(false);
    }
  };

  const isJoin = mode === "JOIN";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
      {/* The form is vertically centred, so without this the keyboard covers
          the input and the submit button on shorter devices. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
          className="px-6"
        >
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
                  placeholderTextColor={themeColors.textDim}
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
                  placeholderTextColor={themeColors.textDim}
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
                <ActivityIndicator color={themeColors.background} />
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
