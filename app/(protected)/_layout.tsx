import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { themeColors } from "@/lib/colors";
export default function ProtectedLayout() {
  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: themeColors.background }}
    >
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: themeColors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="join-group"
          options={{ headerShown: false, presentation: "modal" }}
        />
        <Stack.Screen
          name="new-habit"
          options={{ headerShown: false, presentation: "modal" }}
        />
        <Stack.Screen
          name="group-settings"
          options={{ headerShown: false, presentation: "modal" }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
