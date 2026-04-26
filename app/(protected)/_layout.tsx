import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function ProtectedLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0B0B0C" }}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: "#0B0B0C" } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="join-group"
          options={{ headerShown: false, presentation: "modal" }}
        />
        <Stack.Screen
          name="new-habit"
          options={{ headerShown: false, presentation: "modal" }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
