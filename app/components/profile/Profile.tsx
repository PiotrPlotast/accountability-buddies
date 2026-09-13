import { useState } from "react";
import { View, Text, Pressable, ScrollView, Switch, Alert } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useSupabase } from "@/hooks/useSupabase";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { useProfileData } from "@/hooks/useProfileData";
import { useTheme } from "@/hooks/useTheme";
import { themeColors } from "@/lib/colors";
import Heatmap from "./Heatmap";
import RenameModal from "./RenameModal";
import PencilIcon from "@/app/components/ui/PencilIcon";

const AVATAR_BLURHASH =
  "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[";

function formatMemberSince(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${mm}.${d.getFullYear()}`;
}

export default function Profile() {
  const {
    fullName,
    avatarUrl,
    memberSince,
    groupStreak,
    myGoals,
    groupName,
    groupMemberCount,
    signOut,
  } = useProfileData();
  const { accent, hapticsEnabled, setHapticsEnabled } = useTheme();
  const { session } = useSupabase();
  const router = useRouter();
  const userId = session?.user.id;
  const checkinsToday = myGoals.filter((g) => g.completed_today).length;
  const groupsCount = groupName ? 1 : 0;
  const [renaming, setRenaming] = useState(false);
  const { mutate: deleteAccount, isPending: isDeleting } = useDeleteAccount();
  // The name gate means `fullName` is set for anyone who reaches this screen;
  // the fallback only covers the frame before the profile query resolves.
  const displayName = fullName || "You";
  const initial = displayName.charAt(0).toUpperCase();

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } catch (err) {
            // JSON.stringify on an Error yields "{}" — its fields are
            // non-enumerable. Log the value itself.
            console.error("Sign out failed:", err);
            Alert.alert("Sign out failed", "Please try again.");
          }
        },
      },
    ]);
  };

  // Two alerts rather than one, and deliberately not a type-the-word-DELETE
  // field: that friction belongs to destroying something big and shared, and
  // this is one person's habit list. One tap is still too few on a screen that
  // also carries "Log out".
  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete forever?",
      "Last chance. Your account and everything in it goes for good.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: () => deleteAccount(),
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This removes your habits, your check-in history and your place in the group. It can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: confirmDeleteAccount,
        },
      ],
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest">
          Profile / You
        </Text>
        <Pressable
          onPress={handleSignOut}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Log out"
          accessibilityHint="Signs you out of your account"
          className="w-16 h-9 items-center justify-center"
        >
          <Text className="text-text-muted" style={{ fontSize: 12 }}>
            Log out
          </Text>
        </Pressable>
      </View>

      <View className="px-5 mt-4 flex-row items-center gap-4">
        <View
          className="w-20 h-20 rounded-tile items-center justify-center overflow-hidden"
          style={{ backgroundColor: accent.hex }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${displayName}'s avatar`}
        >
          {avatarUrl ? (
            <Image
              style={{ width: "100%", height: "100%" }}
              source={avatarUrl}
              placeholder={AVATAR_BLURHASH}
              contentFit="cover"
            />
          ) : (
            <Text className="text-bg font-mono-bold" style={{ fontSize: 36 }}>
              {initial}
            </Text>
          )}
        </View>
        <View className="flex-1">
          {/* The pencil is the whole affordance — without it this is text that
              happens to react to a tap, which nobody discovers. The pressed
              dip matches the group row below. `self-start` keeps the target on
              the name rather than the full column width. */}
          <Pressable
            onPress={() => setRenaming(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Change your name"
            accessibilityHint="Opens a dialog to rename yourself"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="flex-row items-center gap-2 self-start"
          >
            <Text
              className="text-text font-mono-bold"
              style={{ fontSize: 28, lineHeight: 30 }}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <PencilIcon color={accent.hex} />
          </Pressable>
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-1">
            Member since {formatMemberSince(memberSince)}
          </Text>
        </View>
      </View>

      <View className="px-5 mt-6 flex-row gap-3">
        <Stat value={String(groupStreak)} label="Streak" color={accent.hex} />
        <Stat
          value={String(checkinsToday)}
          label="Checkins"
          color={accent.hex}
        />
        <Stat value={String(groupsCount)} label="Groups" color={accent.hex} />
      </View>

      <View className="px-5 mt-8">
        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
          Heatmap / Last 12 weeks
        </Text>
        <View className="bg-surface border border-border rounded-tile p-4">
          <Heatmap userId={userId} />
        </View>
      </View>

      <View className="px-5 mt-8">
        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
          Groups / {String(groupsCount).padStart(2, "0")}
        </Text>
        {groupName ? (
          // The chevron always promised this row was tappable; now it is,
          // rather than being a decoration that leads nowhere.
          <Pressable
            onPress={() => router.push("/group-settings" as Href)}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${groupName}, ${groupMemberCount} members, ${groupStreak} day streak`}
            accessibilityHint="Opens group settings"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="bg-surface border border-border rounded-tile px-4 py-4 flex-row items-center gap-3"
          >
            <View className="w-9 h-9 rounded-tile bg-surface-2 items-center justify-center">
              <Text className="text-text-muted font-mono-bold">
                {groupName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-text font-mono-medium text-base">
                {groupName}
              </Text>
              <Text className="text-text-muted font-mono text-xs mt-1">
                {groupMemberCount} ppl · {groupStreak}d streak
              </Text>
            </View>
            <Text className="text-text-dim" style={{ fontSize: 18 }}>
              ›
            </Text>
          </Pressable>
        ) : (
          <Text className="text-text-muted font-mono text-sm">
            No group yet.
          </Text>
        )}
      </View>

      {/* Temporary home. E3 adds a "Notifications and feedback" screen and this
          row moves onto it — one settings surface, not two. */}
      <View className="px-5 mt-8">
        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
          Feedback
        </Text>
        <View className="bg-surface border border-border rounded-tile px-4 py-4 flex-row items-center gap-3">
          <View className="flex-1">
            <Text className="text-text font-mono-medium text-base">
              Haptics
            </Text>
            <Text className="text-text-muted font-mono text-xs mt-1">
              Vibration on taps, check-ins and errors.
            </Text>
          </View>
          <Switch
            value={hapticsEnabled}
            onValueChange={setHapticsEnabled}
            accessibilityLabel="Haptics"
            trackColor={{ false: themeColors.surface2, true: accent.dim }}
            thumbColor={hapticsEnabled ? accent.hex : themeColors.textDim}
          />
        </View>
        <Text className="text-text-dim font-mono text-xs mt-2">
          Stored on this device only.
        </Text>
      </View>

      {/* Deliberately the last thing on the screen, and nowhere near the
          "Log out" control in the header — the two read alike for a second
          and only one of them is recoverable. */}
      <View className="px-5 mt-8">
        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
          Danger zone
        </Text>
        <Pressable
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          accessibilityHint="Asks twice, then permanently deletes your account"
          accessibilityState={{ disabled: isDeleting }}
          style={({ pressed }) => ({
            opacity: pressed || isDeleting ? 0.6 : 1,
          })}
          className="bg-surface border border-danger rounded-tile px-4 py-4 flex-row items-center gap-3"
        >
          <View className="flex-1">
            <Text className="text-danger font-mono-medium text-base">
              Delete account
            </Text>
            <Text className="text-text-muted font-mono text-xs mt-1">
              {isDeleting
                ? "Deleting…"
                : "Removes your habits, your check-in history and your place in the group."}
            </Text>
          </View>
          <Text className="text-danger" style={{ fontSize: 18 }}>
            ›
          </Text>
        </Pressable>
      </View>

      <RenameModal
        isVisible={renaming}
        currentName={fullName ?? ""}
        onClose={() => setRenaming(false)}
      />
    </ScrollView>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    // Grouped so it reads "3 Streak", not two unrelated announcements.
    <View
      className="flex-1 bg-surface border border-border rounded-tile px-4 py-4"
      accessible
      accessibilityLabel={`${value} ${label}`}
    >
      <Text className="font-mono-bold" style={{ fontSize: 28, color }}>
        {value}
      </Text>
      <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-1">
        {label}
      </Text>
    </View>
  );
}
