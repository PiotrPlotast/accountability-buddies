import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";

export default function AddGoalInput() {
  const router = useRouter();

  return (
    <View className="mb-3">
      <Pressable
        onPress={() => router.push("/new-habit")}
        className="h-14 rounded-tile border border-dashed border-border flex-row items-center justify-center gap-2"
      >
        <Text className="text-text-muted font-mono-medium text-lg">+</Text>
        <Text className="text-text-muted font-mono-medium text-sm">
          Add a new habit
        </Text>
      </Pressable>
    </View>
  );
}
