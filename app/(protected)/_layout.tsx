import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useNameGate } from "@/hooks/useNameGate";
import { useNotificationTaps } from "@/hooks/useNotificationTaps";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { useTourGate, useTourSeenSync } from "@/hooks/useTour";
import { themeColors } from "@/lib/colors";

export default function ProtectedLayout() {
  // The name gate is a guard, not a redirect. `Stack.Protected` is the same
  // mechanism the root layout uses to swap `(protected)` for `(public)` on the
  // session, and it wins structurally: while the name is missing the rest of
  // the app is not mounted, so `useDashboardData`'s join-group effect has
  // nothing to race and there is no back gesture out of the name screen.
  const { needsName } = useNameGate();

  // The single mount point for push registration: this layout renders only
  // behind the session guard, and mounting the hook twice would register the
  // same device twice. It runs for a nameless user too — the name gate below
  // swaps out the screens, not this layout.
  usePushRegistration();

  // Likewise the one place a tapped notification is routed from.
  useNotificationTaps();

  // The first-run tour is a guard too, between the name and the rest of the
  // app, so a new user reads it before join-group asks them for a code.
  // `tour` itself stays mounted once named, which is what lets settings push
  // it again as a replay.
  const { needsTour } = useTourGate();
  useTourSeenSync();
  const inApp = !needsName && !needsTour;

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
          <Stack.Screen
            name="tour"
            options={{ headerShown: false, gestureEnabled: !needsTour }}
          />
        </Stack.Protected>

        <Stack.Protected guard={inApp}>
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
          <Stack.Screen
            name="notification-settings"
            options={{ headerShown: false, presentation: "modal" }}
          />
        </Stack.Protected>
      </Stack>
    </GestureHandlerRootView>
  );
}
