import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { Image } from "expo-image";

import { useProfileData } from "@/hooks/useProfileData";
import Heatmap from "./Heatmap";

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
    nickname,
    avatarUrl,
    memberSince,
    groupStreak,
    myGoals,
    groupName,
    groupMemberCount,
    signOut,
  } = useProfileData();

  const checkinsToday = myGoals.filter((g) => g.completed_today).length;
  const groupsCount = groupName ? 1 : 0;
  const displayName = nickname || "You";
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
            console.error(JSON.stringify(err, null, 2));
            Alert.alert("Sign out failed", "Please try again.");
          }
        },
      },
    ]);
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
          className="w-9 h-9 items-center justify-center"
        >
          <Text className="text-text-muted" style={{ fontSize: 18 }}>
            ⚙
          </Text>
        </Pressable>
      </View>

      <View className="px-5 mt-4 flex-row items-center gap-4">
        <View className="w-20 h-20 rounded-tile bg-neon items-center justify-center overflow-hidden">
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
          <Text
            className="text-text font-mono-bold"
            style={{ fontSize: 28, lineHeight: 30 }}
          >
            {displayName}
          </Text>
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-1">
            Member since {formatMemberSince(memberSince)}
          </Text>
        </View>
      </View>

      <View className="px-5 mt-6 flex-row gap-3">
        <Stat value={String(groupStreak)} label="Streak" />
        <Stat value={String(checkinsToday)} label="Checkins" />
        <Stat value={String(groupsCount)} label="Groups" />
      </View>

      <View className="px-5 mt-8">
        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
          Heatmap / 90 days
        </Text>
        <View className="bg-surface border border-border rounded-tile p-4">
          <Heatmap />
        </View>
      </View>

      <View className="px-5 mt-8">
        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
          Groups / {String(groupsCount).padStart(2, "0")}
        </Text>
        {groupName ? (
          <View className="bg-surface border border-border rounded-tile px-4 py-4 flex-row items-center gap-3">
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
          </View>
        ) : (
          <Text className="text-text-muted font-mono text-sm">
            No group yet.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 bg-surface border border-border rounded-tile px-4 py-4">
      <Text className="text-neon font-mono-bold" style={{ fontSize: 28 }}>
        {value}
      </Text>
      <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-1">
        {label}
      </Text>
    </View>
  );
}
