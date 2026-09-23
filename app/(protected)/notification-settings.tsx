import "../../global.css";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ToggleRow from "@/app/components/settings/ToggleRow";
import { useNotificationPrefs } from "@/hooks/useNotificationPrefs";
import { usePushPermission } from "@/hooks/usePushPermission";
import { useSupabase } from "@/hooks/useSupabase";
import { useTheme } from "@/hooks/useTheme";
import { themeColors } from "@/lib/colors";
import { tapLight } from "@/lib/haptics";
import type { NotificationPrefs } from "@/hooks/useNotificationPrefs";

/**
 * One settings surface, not two: the notification preferences (per account),
 * the haptics switch (per device, moved off `Profile.tsx`), and sign-out.
 */
export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { prefs, setPref } = useNotificationPrefs();
  const permission = usePushPermission();
  const { accent, hapticsEnabled, setHapticsEnabled } = useTheme();
  const { signOut } = useSupabase();

  // `null` is "not read yet". Rendering it as blocked would warn people about
  // a permission they actually have, for the frame before the check resolves.
  const blocked = permission !== null && !permission.granted;

  const change = (patch: Partial<NotificationPrefs>) => {
    // Confirms the touch, not the write — the haptics rule about never
    // vibrating in response to server data.
    tapLight();
    setPref(patch);
  };

  const handleSignOut = () => {
    Alert.alert("Log out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } catch (err) {
            // JSON.stringify on an Error yields "{}" — its fields are
            // non-enumerable. Log the value itself.
            console.error("Sign out failed:", err);
            Alert.alert("Log out failed", "Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
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
        <Text className="text-text font-mono-medium text-base">
          Notifications
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {blocked ? (
          // Without this, someone who tapped "Don't Allow" once has no route
          // back inside the app and the whole feature reads as broken rather
          // than as switched off.
          <View className="bg-surface border border-danger rounded-tile px-4 py-4 mb-8">
            <Text className="text-danger font-mono-medium text-base">
              Notifications are off for this app
            </Text>
            <Text className="text-text-muted font-mono text-xs mt-1">
              iOS is blocking delivery to this device. The switches below still
              apply to your other devices.
            </Text>
            <Pressable
              onPress={() => Linking.openSettings()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open Settings"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              className="mt-3 self-start"
            >
              <Text
                className="font-mono-medium text-sm"
                style={{ color: accent.hex }}
              >
                Open Settings ›
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
          Push
        </Text>
        <View className="gap-3">
          <ToggleRow
            label="Reminders"
            description="Your habits, at the time you set."
            value={prefs?.reminders_enabled ?? false}
            onValueChange={(v) => change({ reminders_enabled: v })}
          />
          <ToggleRow
            label="Nudges"
            description="When a buddy pokes you to check in."
            value={prefs?.nudges_enabled ?? false}
            onValueChange={(v) => change({ nudges_enabled: v })}
          />
          <ToggleRow
            label="Buddy activity"
            description="When someone closes out their day or joins your group."
            value={prefs?.social_enabled ?? false}
            onValueChange={(v) => change({ social_enabled: v })}
          />
        </View>
        <Text className="text-text-dim font-mono text-xs mt-2">
          Applies to every device you sign in on.
        </Text>

        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-8 mb-3">
          Feedback
        </Text>
        <ToggleRow
          label="Haptics"
          description="Vibration on taps, check-ins and errors."
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
        />
        <Text className="text-text-dim font-mono text-xs mt-2">
          Stored on this device only.
        </Text>

        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-8 mb-3">
          Account
        </Text>
        <Pressable
          onPress={handleSignOut}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Log out"
          accessibilityHint="Signs you out of your account"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          className="bg-surface border border-border rounded-tile px-4 py-4 flex-row items-center gap-3"
        >
          <Text className="flex-1 text-text font-mono-medium text-base">
            Log out
          </Text>
          <Text style={{ fontSize: 18, color: themeColors.textDim }}>›</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
