import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useTheme } from "@/hooks/useTheme";
import ProgressRing from "./ProgressRing";
import { Goal } from "@/types/dashboardTypes";

type Props = {
  todayGoals: Goal[];
  onOpenHabitManager: () => void;
};

export default function DashboardHeader({
  todayGoals,
  onOpenHabitManager,
}: Props) {
  const { groupName, groupIcon, streak, members } = useDashboardData();
  const { accent } = useTheme();
  const router = useRouter();

  const peopleCount = members.length;

  const done = todayGoals.filter((g) => g.completed_today).length;
  const total = todayGoals.length;
  const progress = total > 0 ? done / total : 0;

  return (
    <View className="px-5 pt-2 pb-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View
            className="w-8 h-8 rounded-tile items-center justify-center"
            style={{ backgroundColor: accent.hex }}
          >
            <Text style={{ fontSize: 16 }}>{groupIcon}</Text>
          </View>
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest">
            Group · {peopleCount} {peopleCount === 1 ? "person" : "people"}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={onOpenHabitManager}
            hitSlop={8}
            className="bg-surface border border-border px-3 h-8 rounded-pill flex-row items-center justify-center"
          >
            <Text className="text-text font-mono-medium text-xs uppercase tracking-widest">
              Habits
            </Text>
          </Pressable>

          <View className="bg-surface border border-border px-3 h-8 rounded-pill flex-row items-center gap-1">
            <Text style={{ fontSize: 12 }}>🔥</Text>
            <Text className="text-text font-mono-medium text-sm">{streak}</Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={() => router.push("/group-settings" as Href)}
        className="mt-5 flex-row items-center gap-2 self-start"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <Text
          className="text-text font-mono-bold"
          style={{ fontSize: 34, lineHeight: 38 }}
        >
          {groupName}
        </Text>
        <Text className="text-text-muted mt-1" style={{ fontSize: 24 }}>
          ›
        </Text>
      </Pressable>

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
