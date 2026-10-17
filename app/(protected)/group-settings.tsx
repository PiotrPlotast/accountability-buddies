import "../../global.css";
import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import AppTextInput from "@/app/components/ui/AppTextInput";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { useActiveGroup } from "@/hooks/useActiveGroup";
import { useUpdateGroup } from "@/hooks/useUpdateGroup";
import { useLeaveGroup } from "@/hooks/useLeaveGroup";
import { usePendingGoalChanges } from "@/hooks/usePendingGoalChanges";
import { useTheme } from "@/hooks/useTheme";
import IconPicker from "@/app/components/habits/IconPicker";
import NeedsConnection from "@/app/components/ui/NeedsConnection";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import ScreenHeader from "@/app/components/ui/ScreenHeader";
import { themeColors } from "@/lib/colors";
import { useIsOnline } from "@/lib/onlineStatus";
import { MAX_GROUP_NAME_LENGTH } from "@/lib/textLimits";
import SectionLabel from "@/app/components/ui/SectionLabel";

export default function GroupSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeGroupId, groupName, groupIcon, inviteCode } = useActiveGroup();
  const { accent, palette, accentId, setAccent } = useTheme();
  const updateGroup = useUpdateGroup();
  // The name and icon are the whole group's, so they don't queue offline. The
  // accent below is this phone's and works either way.
  const isOnline = useIsOnline();
  const leaveGroup = useLeaveGroup();
  const pendingChanges = usePendingGoalChanges();
  const leaveBlocked = !activeGroupId || !isOnline || leaveGroup.isPending;

  // Only what the user changed is state; untouched, each field shows the
  // group's current value, so it fills in once the group lands and follows a
  // rename from elsewhere until the user types or picks.
  const [nameDraft, setName] = useState<string | null>(null);
  const [iconDraft, setIcon] = useState<string | null>(null);
  const name = nameDraft ?? groupName ?? "";
  const icon = iconDraft ?? groupIcon;

  const trimmedName = name.trim();
  const dirty =
    (trimmedName.length > 0 && trimmedName !== groupName) || icon !== groupIcon;
  const canSave =
    !!activeGroupId && dirty && isOnline && !updateGroup.isPending;

  const handleSave = async () => {
    if (!canSave || !activeGroupId) return;
    const payload: { name?: string; icon?: string } = {};
    if (trimmedName.length > 0 && trimmedName !== groupName) {
      payload.name = trimmedName;
    }
    if (icon !== groupIcon) payload.icon = icon;
    try {
      await updateGroup.mutateAsync({ groupId: activeGroupId, ...payload });
      router.back();
    } catch {
      // useUpdateGroup.onError surfaces an Alert already.
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert("Copied", `Invite code ${inviteCode} copied.`);
  };

  // Back to the dashboard, which sees no group and moves on to join-group.
  // A queued habit change made in this group may be refused once you're out
  // of it, so it is warned about the way Log out warns.
  const handleLeave = () => {
    if (leaveBlocked) return;
    const unsynced =
      pendingChanges > 0
        ? ` ${pendingChanges} ${pendingChanges === 1 ? "change hasn't" : "changes haven't"} synced and will be lost.`
        : "";
    Alert.alert(
      `Leave ${groupName ?? "the group"}?`,
      `You'll need a new invite code to come back.${unsynced}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () =>
            leaveGroup.mutate(undefined, { onSuccess: () => router.back() }),
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title="Group settings"
        right={
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            hitSlop={12}
            className="w-14 items-end justify-center"
          >
            <Text
              className="font-mono-medium text-base"
              style={{ color: canSave ? accent.hex : themeColors.textDim }}
            >
              {updateGroup.isPending ? "..." : "Save"}
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <SectionLabel className="mb-3">Group name</SectionLabel>
        <View
          className="border-2 rounded-tile px-4 h-14 justify-center bg-bg"
          style={{ borderColor: accent.hex }}
        >
          <AppTextInput
            value={name}
            onChangeText={setName}
            placeholder="Swole Mates"
            maxLength={MAX_GROUP_NAME_LENGTH}
            className="text-text text-base"
          />
        </View>

        <SectionLabel className="mt-8 mb-3">Group icon</SectionLabel>
        <View className="flex-row items-center gap-4 mb-4">
          <View
            className="w-16 h-16 rounded-tile items-center justify-center"
            style={{ backgroundColor: accent.hex }}
          >
            <Text style={{ fontSize: 32 }}>{icon}</Text>
          </View>
          <Text className="text-text-muted font-mono text-sm flex-1">
            Pick an emoji that represents your crew.
          </Text>
        </View>
        <IconPicker kind="group" value={icon} onChange={setIcon} />

        <SectionLabel className="mt-8 mb-3">Invite code</SectionLabel>
        <Pressable
          onPress={handleCopyInvite}
          disabled={!inviteCode}
          className="bg-surface border border-border rounded-tile px-4 h-14 flex-row items-center justify-between"
        >
          {/* A Text, so `font-mono-bold` reaches it — this used to say medium
              in the class and bold in an inline override. */}
          <Text className="text-text font-mono-bold text-base tracking-widest">
            {inviteCode || "—"}
          </Text>
          <Text className="text-text-dim" style={{ fontSize: 16 }}>
            ⧉
          </Text>
        </Pressable>
        <Text className="text-text-dim font-mono text-xs mt-2">
          Tap to copy. Share with people you want to add.
        </Text>

        <SectionLabel className="mt-8 mb-3">Your accent color</SectionLabel>
        <View className="flex-row flex-wrap gap-3">
          {palette.map((p) => {
            const active = p.id === accentId;
            return (
              <Pressable
                key={p.id}
                onPress={() => setAccent(p.id)}
                hitSlop={6}
                className="w-12 h-12 rounded-pill items-center justify-center"
                style={{
                  backgroundColor: p.hex,
                  borderWidth: active ? 3 : 0,
                  borderColor: themeColors.text,
                }}
              >
                {active ? (
                  <Text className="text-bg font-mono-bold">✓</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Text className="text-text-dim font-mono text-xs mt-2">
          Stored on this device only — each member can pick their own.
        </Text>

        <SectionLabel className="mt-8 mb-3">Danger zone</SectionLabel>
        <Pressable
          onPress={handleLeave}
          disabled={leaveBlocked}
          accessibilityRole="button"
          accessibilityLabel="Leave group"
          accessibilityHint="Asks first, then takes you out of this group"
          accessibilityState={{ disabled: leaveBlocked }}
          style={{ opacity: leaveBlocked ? 0.6 : 1 }}
          className="bg-surface border border-danger rounded-tile px-4 py-4"
        >
          <Text className="text-danger font-mono-medium text-base">
            {leaveGroup.isPending ? "Leaving..." : "Leave group"}
          </Text>
        </Pressable>
        <Text className="text-text-dim font-mono text-xs mt-2">
          Your habits and history come with you to your next group.
        </Text>
        {!isOnline ? <NeedsConnection /> : null}
      </ScrollView>

      <View
        className="absolute left-0 right-0 bg-bg px-5"
        style={{ bottom: 0, paddingBottom: insets.bottom + 16, paddingTop: 12 }}
      >
        <PrimaryButton
          label="Save changes"
          onPress={handleSave}
          filled={canSave}
          busy={updateGroup.isPending}
        />
        {!isOnline ? <NeedsConnection /> : null}
      </View>
    </View>
  );
}
