import { View, Text, TouchableOpacity } from "react-native";
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
    <View className="flex-row border-b border-gray-100">
      {members.map((member) => (
        <TouchableOpacity
          key={member.user_id}
          onPress={() => onSelect(member.user_id)}
          className={`flex-1 p-4 items-center border-b-2 ${member.user_id === selectedTabId ? "border-indigo-600" : "border-transparent"}`}
        >
          <Text
            className={`font-bold ${member.user_id === selectedTabId ? "text-indigo-600" : "text-gray-400"}`}
          >
            {member.user_id === userId ? "YOU" : member.full_name.split(" ")[0]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
