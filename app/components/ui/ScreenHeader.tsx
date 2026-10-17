import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

/**
 * The header of a modal screen: back on the left, the title centred, and an
 * optional action on the right (a spacer otherwise, to keep the title centred).
 */
export default function ScreenHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <View className="flex-row items-center justify-between px-5 h-14">
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="w-10 h-10 items-center justify-center"
      >
        <Text className="text-text font-mono-medium text-2xl">‹</Text>
      </Pressable>
      <Text
        accessibilityRole="header"
        className="text-text font-mono-medium text-base"
      >
        {title}
      </Text>
      {right ?? <View className="w-10" />}
    </View>
  );
}
