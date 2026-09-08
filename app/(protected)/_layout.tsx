import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useNameGate } from "@/hooks/useNameGate";
import { themeColors } from "@/lib/colors";

export default function ProtectedLayout() {
  // The name gate is a guard, not a redirect. `Stack.Protected` is the same
  // mechanism the root layout uses to swap `(protected)` for `(public)` on the
  // session, and it wins structurally: while the name is missing the rest of
  // the app is not mounted, so `useDashboardData`'s join-group effect has
  // nothing to race and there is no back gesture out of the name screen.
  const { needsName } = useNameGate();

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: themeColors.background }}
    >
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: themeColors.background },
        }}
      >
        <Stack.Protected guard={needsName}>
          <Stack.Screen
            name="name"
            options={{ headerShown: false, gestureEnabled: false }}
          />
        </Stack.Protected>

        <Stack.Protected guard={!needsName}>
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
        </Stack.Protected>
      </Stack>
    </GestureHandlerRootView>
  );
}
