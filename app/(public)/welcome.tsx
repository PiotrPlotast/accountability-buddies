import { Text, Pressable } from "react-native";

import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Page() {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <Text className="text-4xl text-center">
        Welcome to{"\n"}Accountability Buddies
      </Text>
      <Pressable
        className="bg-gray-300 w-full p-4 rounded-full justify-center items-center"
        onPress={() => router.push("/sign-up")}
      >
        <Text>Go to sign up</Text>
      </Pressable>
      <Pressable
        className="bg-gray-300 w-full p-4 rounded-full justify-center items-center"
        onPress={() => router.push("/sign-in")}
      >
        <Text>Go to sign in</Text>
      </Pressable>
    </SafeAreaView>
  );
}
