import "../../global.css";
import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { useDashboardData } from "@/hooks/useDashboardData";
import { useUpdateGroup } from "@/hooks/useUpdateGroup";
import { useTheme } from "@/hooks/useTheme";

const ICON_CHOICES = [
  "👥",
  "🪵",
  "🔥",
  "⚡",
  "🌱",
  "🏔️",
  "🌊",
  "☀️",
  "🌙",
  "⭐",
  "🎯",
  "🏆",
  "💪",
  "🧠",
  "📚",
  "✍️",
  "🎨",
  "🎸",
  "🏃",
  "🧘",
  "🥗",
  "💧",
  "🍵",
  "🐺",
];

export default function GroupSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeGroupId, groupName, groupIcon, inviteCode } =
    useDashboardData();
  const { accent, palette, accentId, setAccent } = useTheme();
  const updateGroup = useUpdateGroup();

  const [name, setName] = useState(groupName === "Loading..." ? "" : groupName);
  const [icon, setIcon] = useState(groupIcon);

  useEffect(() => {
    setIcon(groupIcon);
  }, [groupIcon]);

  useEffect(() => {
    if (groupName !== "Loading...") {
      setName(groupName);
    }
  }, [groupName]);

  const trimmedName = name.trim();
  const dirty =
    (trimmedName.length > 0 && trimmedName !== groupName) || icon !== groupIcon;
  const canSave = !!activeGroupId && dirty && !updateGroup.isPending;

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

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 h-14">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="w-10 h-10 items-center justify-center"
        >
          <Text className="text-text font-mono-medium text-2xl">‹</Text>
        </Pressable>
        <Text className="text-text font-mono-medium text-base">
          Group settings
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          hitSlop={12}
          className="w-14 items-end justify-center"
        >
          <Text
            className="font-mono-medium text-base"
            style={{ color: canSave ? accent.hex : "#6B7280" }}
          >
            {updateGroup.isPending ? "..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
          Group name
        </Text>
        <View
          className="border-2 rounded-tile px-4 h-14 justify-center bg-bg"
          style={{ borderColor: accent.hex }}
        >
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Swole Mates"
            placeholderTextColor="#6B7280"
            className="text-text font-mono text-base"
            style={{ fontFamily: "GeistMono_400Regular" }}
          />
        </View>

        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-8 mb-3">
          Group icon
        </Text>
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
        <View className="flex-row flex-wrap gap-3">
          {ICON_CHOICES.map((emoji) => {
            const selected = icon === emoji;
            return (
              <Pressable
                key={emoji}
                onPress={() => setIcon(emoji)}
                className={`w-14 h-14 rounded-tile items-center justify-center ${
                  selected ? "" : "bg-surface border border-border"
                }`}
                style={selected ? { backgroundColor: accent.hex } : undefined}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-8 mb-3">
          Invite code
        </Text>
        <Pressable
          onPress={handleCopyInvite}
          disabled={!inviteCode}
          className="bg-surface border border-border rounded-tile px-4 h-14 flex-row items-center justify-between"
        >
          <Text
            className="text-text font-mono-medium text-base tracking-widest"
            style={{ fontFamily: "GeistMono_700Bold" }}
          >
            {inviteCode || "—"}
          </Text>
          <Text className="text-text-dim" style={{ fontSize: 16 }}>
            ⧉
          </Text>
        </Pressable>
        <Text className="text-text-dim font-mono text-xs mt-2">
          Tap to copy. Share with people you want to add.
        </Text>

        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-8 mb-3">
          Your accent color
        </Text>
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
                  borderColor: "#F4F4F5",
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
      </ScrollView>

      <View
        className="absolute left-0 right-0 bg-bg px-5"
        style={{ bottom: 0, paddingBottom: insets.bottom + 16, paddingTop: 12 }}
      >
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          className="h-14 rounded-tile items-center justify-center"
          style={{ backgroundColor: canSave ? accent.hex : "#151517" }}
        >
          {updateGroup.isPending ? (
            <ActivityIndicator color="#0B0B0C" />
          ) : (
            <Text
              className="font-mono-bold text-base"
              style={{ color: canSave ? "#0B0B0C" : "#6B7280" }}
            >
              Save changes
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
