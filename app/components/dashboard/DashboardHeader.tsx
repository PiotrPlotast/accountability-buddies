import { View, Text, TouchableOpacity, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";

type Props = {
  groupName: string;
  streak: number;
  inviteCode: string;
  isWaiting: boolean;
};

export default function DashboardHeader({
  groupName,
  streak,
  inviteCode,
  isWaiting,
}: Props) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert("Copied!", `Code ${inviteCode} copied.`);
  };

  return (
    <View className="pt-14 pb-6 px-6 bg-slate-900">
      <View className="flex-row justify-between items-start">
        <View>
          <Text className="text-gray-400 text-xs font-bold tracking-widest uppercase mb-1">
            {groupName}
          </Text>
          <TouchableOpacity
            onPress={handleCopy}
            className="bg-indigo-600 px-3 py-1 rounded-full self-start flex-row items-center mt-1"
          >
            <Text className="text-white text-xs font-bold mr-1">
              Invite: {inviteCode}
            </Text>
            <Text className="text-white text-xs">📋</Text>
          </TouchableOpacity>
        </View>
        <View className="items-end">
          {isWaiting && (
            <Text className="text-yellow-400 text-[10px] font-bold uppercase mb-1">
              Waiting...
            </Text>
          )}
          <Text
            className={`text-3xl font-bold ${isWaiting ? "text-yellow-200" : "text-white"}`}
          >
            Day {streak}
          </Text>
          <Text className="text-3xl">{isWaiting ? "⏳" : "🔥"}</Text>
        </View>
      </View>
    </View>
  );
}
