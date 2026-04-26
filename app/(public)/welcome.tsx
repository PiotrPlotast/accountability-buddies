import "../../global.css";
import { Text, Pressable, View } from "react-native";

import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Page() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0B0C" }}>
      <View className="flex-1 px-6 justify-between pb-6">
        <View className="mt-10">
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-4">
            Accountability Buddies
          </Text>
          <Text
            className="text-text font-mono-bold"
            style={{ fontSize: 40, lineHeight: 44 }}
          >
            Start a{"\n"}
            <Text className="text-neon">tiny crew.</Text>
          </Text>
          <Text className="text-text-muted font-mono text-base mt-4">
            Two to six people. Shared streaks. Zero guilt trips. Just a friend
            checking in.
          </Text>
        </View>

        <View className="gap-3">
          <Pressable
            className="h-14 rounded-tile items-center justify-center bg-neon"
            onPress={() => router.push("/sign-up")}
          >
            <Text className="text-bg font-mono-bold">Create account</Text>
          </Pressable>
          <Pressable
            className="h-14 rounded-tile items-center justify-center bg-surface border border-border"
            onPress={() => router.push("/sign-in")}
          >
            <Text className="text-text font-mono-medium">
              I have an account
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
