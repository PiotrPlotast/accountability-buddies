import { Text, Pressable, ScrollView } from "react-native";
import { Member } from "@/types/dashboardTypes";

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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      className="py-2"
    >
      {members.map((member) => {
        const isActive = member.user_id === selectedTabId;
        const isMe = member.user_id === userId;
        const label = isMe ? "You" : member.full_name.split(" ")[0];
        const done = member.goals.filter((g) => g.completed_today).length;
        const total = member.goals.length;

        return (
          <Pressable
            key={member.user_id}
            onPress={() => onSelect(member.user_id)}
            className={`px-4 h-11 rounded-pill flex-row items-center gap-2 ${
              isActive ? "bg-neon" : "bg-surface border border-border"
            }`}
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
