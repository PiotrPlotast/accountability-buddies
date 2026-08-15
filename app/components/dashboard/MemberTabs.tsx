import { Text, Pressable, ScrollView } from "react-native";
import { Member } from "@/types/dashboardTypes";
import { useTheme } from "@/hooks/useTheme";
import { filterGoalsForToday } from "@/lib/repeatDays";

type Props = {
  members: Member[];
  selectedTabId: string;
  onSelect: (id: string) => void;
  userId?: string;
};

export default function MemberTabs({
  members,
  selectedTabId,
  onSelect,
  userId,
}: Props) {
  const { accent } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      className="py-2"
      accessibilityRole="tablist"
    >
      {members.map((member) => {
        const isActive = member.user_id === selectedTabId;
        const isMe = member.user_id === userId;
        const label = isMe ? "You" : member.full_name.split(" ")[0];
        const todayGoals = filterGoalsForToday(member.goals);
        const done = todayGoals.filter((g) => g.completed_today).length;
        const total = todayGoals.length;

        return (
          <Pressable
            key={member.user_id}
            onPress={() => onSelect(member.user_id)}
            // Groups the name and the count into one announcement instead of
            // two loose fragments.
            accessible
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            // The chip reads as "Ann, 2 of 3 done" rather than letting the
            // label and the count be announced as two unrelated fragments.
            accessibilityLabel={`${isMe ? "You" : member.full_name}, ${done} of ${total} done`}
            className={`px-4 h-11 rounded-pill flex-row items-center gap-2 ${
              isActive ? "" : "bg-surface border border-border"
            }`}
            style={isActive ? { backgroundColor: accent.hex } : undefined}
          >
            <Text
              className={`font-mono-medium text-sm ${isActive ? "text-bg" : "text-text"}`}
            >
              {label}
            </Text>
            <Text
              className={`font-mono text-xs ${isActive ? "text-bg" : "text-text-muted"}`}
            >
              {done}/{total}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
