import { View, Text, Pressable, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useDashboardData } from "@/hooks/useDashboardData";
import ProgressRing from "./ProgressRing";

export default function DashboardHeader() {
  const { groupName, streak, inviteCode, members, userId } = useDashboardData();
  const me = members.find((m) => m.user_id === userId);
  const myGoals = me?.goals ?? [];
  const done = myGoals.filter((g) => g.completed_today).length;
  const total = myGoals.length;
  const progress = total > 0 ? done / total : 0;

  const handleCopy = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert("Copied", `Invite code ${inviteCode} copied.`);
  };

  const peopleCount = members.length;

  return (
    <View className="px-5 pt-2 pb-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View className="w-8 h-8 rounded-tile bg-neon items-center justify-center">
            <Text style={{ fontSize: 16 }}>🪵</Text>
          </View>
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest">
            Group · {peopleCount} {peopleCount === 1 ? "person" : "people"}
          </Text>
        </View>
        <View className="bg-surface border border-border px-3 h-8 rounded-pill flex-row items-center gap-1">
          <Text style={{ fontSize: 12 }}>🔥</Text>
          <Text className="text-text font-mono-medium text-sm">{streak}d</Text>
        </View>
      </View>

      <Text
        className="text-text font-mono-bold mt-5"
        style={{ fontSize: 34, lineHeight: 38 }}
      >
        {groupName}
      </Text>

      {inviteCode ? (
        <Pressable
          onPress={handleCopy}
          hitSlop={8}
          className="flex-row items-center gap-2 mt-3 self-start"
        >
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest">
            Invite
          </Text>
          <Text className="text-text font-mono-medium text-sm">
            {inviteCode}
          </Text>
          <Text className="text-text-dim" style={{ fontSize: 12 }}>
            ⧉
          </Text>
        </Pressable>
      ) : null}

      <View className="mt-5 bg-surface border border-border rounded-tile px-5 py-4 flex-row items-center justify-between">
        <View>
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-1">
            Today
          </Text>
          <Text className="text-text font-mono-bold text-xl">
            {done} of {total} done
          </Text>
        </View>
        <ProgressRing progress={progress} size={56} stroke={6} />
      </View>
    </View>
  );
}
