import "../../global.css";
import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import AppTextInput from "@/app/components/ui/AppTextInput";
import { useRouter } from "expo-router";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { useActiveGroup } from "@/hooks/useActiveGroup";
import { usePendingGoalChanges } from "@/hooks/usePendingGoalChanges";
import { useSupabase } from "@/hooks/useSupabase";
import { useTheme } from "@/hooks/useTheme";
import NeedsConnection from "@/app/components/ui/NeedsConnection";
import { useIsOnline } from "@/lib/onlineStatus";
import { MAX_GROUP_NAME_LENGTH } from "@/lib/textLimits";
import { queryKeys } from "@/lib/queryKeys";
import SectionLabel from "@/app/components/ui/SectionLabel";

export default function JoinGroupScreen() {
  const { supabase, session, signOut } = useSupabase();
  const { accent, colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeGroupId } = useActiveGroup();
  const pendingChanges = usePendingGoalChanges();

  // You were sent here on a "no group" that may be cached from before you
  // joined, so ask again on the way in. Not while the cache is being restored
  // after a launch: the restore would put the old answer back over the new.
  const isRestoring = useIsRestoring();
  useEffect(() => {
    if (isRestoring) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.groupStatsAll() });
  }, [isRestoring, queryClient]);

  // Leave as soon as the group read says you have one, whether you just
  // joined, just created, or were sent here on an out-of-date answer. On
  // iPhone this screen is a modal over the dashboard, which stays mounted
  // underneath, so it is dismissed rather than replaced; with nothing
  // underneath, `dismissTo` replaces it instead.
  useEffect(() => {
    if (activeGroupId) router.dismissTo("/");
  }, [activeGroupId, router]);

  // Reading the group again is what takes you to the dashboard (above).
  const refreshGroup = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.groupStatsAll() });

  // Without a group there is no way to reach Settings, so this is the only
  // way out of the screen. Same wording and warning as Settings' Log out.
  const handleSignOut = () => {
    const message =
      pendingChanges > 0
        ? `${pendingChanges} ${pendingChanges === 1 ? "change hasn't" : "changes haven't"} synced and will be lost.`
        : "Are you sure?";
    Alert.alert("Log out", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } catch (err) {
            console.error("Sign out failed:", err);
            Alert.alert("Log out failed", "Please try again.");
          }
        },
      },
    ]);
  };

  const [code, setCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"JOIN" | "CREATE">("JOIN");
  const isOnline = useIsOnline();

  const handleJoin = async () => {
    if (loading || !isOnline) return;
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
      await refreshGroup();
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
    if (loading || !isOnline) return;
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
      await refreshGroup();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
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
            accessibilityRole="header"
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
            <SectionLabel>{isJoin ? "Invite code" : "Group name"}</SectionLabel>
            {isJoin ? (
              <View
                className="border-2 rounded-tile px-4 h-16 justify-center bg-bg"
                style={{ borderColor: accent.hex }}
              >
                <AppTextInput
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  placeholder="A1B2C3D4E5"
                  accessibilityLabel="Invite code"
                  weight="bold"
                  className="text-text text-2xl text-center tracking-widest"
                />
              </View>
            ) : (
              <View
                className="border-2 rounded-tile px-4 h-14 justify-center bg-bg"
                style={{ borderColor: accent.hex }}
              >
                <AppTextInput
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="Swole Mates"
                  accessibilityLabel="Group name"
                  maxLength={MAX_GROUP_NAME_LENGTH}
                  className="text-text text-base"
                />
              </View>
            )}

            <Pressable
              onPress={isJoin ? handleJoin : handleCreate}
              disabled={loading || !isOnline}
              accessibilityRole="button"
              accessibilityLabel={isJoin ? "Join group" : "Create group"}
              accessibilityState={{
                disabled: loading || !isOnline,
                busy: loading,
              }}
              className="h-14 rounded-tile items-center justify-center mt-2"
              style={{
                backgroundColor: accent.hex,
                opacity: isOnline ? 1 : 0.4,
              }}
            >
              {loading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text className="text-on-accent font-mono-bold">
                  {isJoin ? "Join group" : "Create group"}
                </Text>
              )}
            </Pressable>
            {!isOnline ? <NeedsConnection /> : null}
          </View>

          <Pressable
            onPress={() => setMode(isJoin ? "CREATE" : "JOIN")}
            accessibilityRole="button"
            className="mt-8 items-center"
          >
            <Text
              className="font-mono-medium text-sm"
              style={{ color: accent.text }}
            >
              {isJoin
                ? "No code? Create a new group"
                : "Have a code? Join instead"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityHint="Signs you out of your account"
            className="mt-6 items-center"
          >
            <Text className="text-text-muted font-mono text-sm">Log out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
