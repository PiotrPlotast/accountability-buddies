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

import AppearancePicker from "@/app/components/settings/AppearancePicker";
import ToggleRow from "@/app/components/settings/ToggleRow";
import NeedsConnection from "@/app/components/ui/NeedsConnection";
import ScreenHeader from "@/app/components/ui/ScreenHeader";
import TimePicker from "@/app/components/habits/TimePicker";
import { useNotificationPrefs } from "@/hooks/useNotificationPrefs";
import { usePendingGoalChanges } from "@/hooks/usePendingGoalChanges";
import { usePushPermission } from "@/hooks/usePushPermission";
import { useSupabase } from "@/hooks/useSupabase";
import { useTheme } from "@/hooks/useTheme";
import { tapLight } from "@/lib/haptics";
import { useIsOnline } from "@/lib/onlineStatus";
import {
  DEFAULT_QUIET_END,
  DEFAULT_QUIET_START,
  toHHMM,
} from "@/lib/reminderTime";
import type { NotificationPrefs } from "@/hooks/useNotificationPrefs";
import SectionLabel from "@/app/components/ui/SectionLabel";

/**
 * One settings surface, not two: the notification preferences (per account),
 * the appearance and haptics switch (per device; haptics moved off
 * `Profile.tsx`), and sign-out.
 */
export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { prefs, setPref } = useNotificationPrefs();
  const permission = usePushPermission();
  const { accent, hapticsEnabled, setHapticsEnabled, colors } = useTheme();
  const { signOut } = useSupabase();
  // The preferences are the account's, read by the server's cron, so they
  // don't queue offline. Haptics is this phone's and works either way.
  const isOnline = useIsOnline();
  const pendingChanges = usePendingGoalChanges();

  // `null` is "not read yet". Rendering it as blocked would warn people about
  // a permission they actually have, for the frame before the check resolves.
  const blocked = permission !== null && !permission.granted;

  const change = (patch: Partial<NotificationPrefs>) => {
    if (!isOnline) return;
    // Confirms the touch, not the write — the haptics rule about never
    // vibrating in response to server data.
    tapLight();
    setPref(patch);
  };

  const quietStart = toHHMM(prefs?.quiet_start);
  const quietEnd = toHHMM(prefs?.quiet_end);
  const quietOn = !!quietStart && !!quietEnd;

  // The table rejects equal start and end (empty or 24h, depending on who
  // reads it), so the picker refuses that pick instead of letting the write
  // fail into an Alert.
  const changeQuiet = (patch: { quiet_start?: string; quiet_end?: string }) => {
    if (!isOnline) return;
    const start = patch.quiet_start ?? quietStart;
    const end = patch.quiet_end ?? quietEnd;
    if (start === end) return;
    setPref(patch);
  };

  const handleSignOut = () => {
    // Signing out clears the queue with the rest of the cache, so changes
    // made offline that haven't synced would go with it. Still allowed.
    const message =
      pendingChanges > 0
        ? `${pendingChanges} ${pendingChanges === 1 ? "change hasn't" : "changes haven't"} synced and will be lost.`
        : "Are you sure?";
    Alert.alert("Log out", message, [
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
      <ScreenHeader title="Notifications" />

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
                style={{ color: accent.text }}
              >
                Open Settings ›
              </Text>
            </Pressable>
          </View>
        ) : null}

        <SectionLabel className="mb-3">Push</SectionLabel>
        <View className="gap-3">
          <ToggleRow
            label="Reminders"
            disabled={!isOnline}
            description="Your habits, at the time you set."
            value={prefs?.reminders_enabled ?? false}
            onValueChange={(v) => change({ reminders_enabled: v })}
          />
          <ToggleRow
            label="Nudges"
            disabled={!isOnline}
            description="When a buddy pokes you to check in."
            value={prefs?.nudges_enabled ?? false}
            onValueChange={(v) => change({ nudges_enabled: v })}
          />
          <ToggleRow
            label="Buddy activity"
            disabled={!isOnline}
            description="When someone closes out their day or joins your group."
            value={prefs?.social_enabled ?? false}
            onValueChange={(v) => change({ social_enabled: v })}
          />
        </View>
        {isOnline ? (
          <Text className="text-text-dim font-mono text-xs mt-2">
            Applies to every device you sign in on.
          </Text>
        ) : (
          <NeedsConnection className="text-left" />
        )}

        <SectionLabel className="mt-8 mb-3">Quiet hours</SectionLabel>
        <View className="gap-3">
          <ToggleRow
            label="Quiet hours"
            disabled={!isOnline}
            description="Reminders that fall in this window are skipped."
            value={quietOn}
            onValueChange={(on) =>
              change(
                on
                  ? {
                      quiet_start: DEFAULT_QUIET_START,
                      quiet_end: DEFAULT_QUIET_END,
                    }
                  : { quiet_start: null, quiet_end: null },
              )
            }
          />
          {quietOn ? (
            <>
              <TimePicker
                label="From"
                value={quietStart}
                onChange={(t) => t && changeQuiet({ quiet_start: t })}
                allowOff={false}
              />
              <TimePicker
                label="To"
                value={quietEnd}
                onChange={(t) => t && changeQuiet({ quiet_end: t })}
                allowOff={false}
              />
            </>
          ) : null}
        </View>

        <SectionLabel className="mt-8 mb-3">Appearance</SectionLabel>
        <AppearancePicker />
        <Text className="text-text-dim font-mono text-xs mt-2">
          System follows your phone. Stored on this device only.
        </Text>

        <SectionLabel className="mt-8 mb-3">Feedback</SectionLabel>
        <ToggleRow
          label="Haptics"
          description="Vibration on taps, check-ins and errors."
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
        />
        <Text className="text-text-dim font-mono text-xs mt-2">
          Stored on this device only.
        </Text>

        <SectionLabel className="mt-8 mb-3">Help</SectionLabel>
        <Pressable
          onPress={() => router.push("/tour-replay")}
          accessibilityRole="button"
          accessibilityLabel="Show the tour again"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          className="bg-surface border border-border rounded-tile px-4 py-4 flex-row items-center gap-3"
        >
          <Text className="flex-1 text-text font-mono-medium text-base">
            Show the tour again
          </Text>
          <Text style={{ fontSize: 18, color: colors.textDim }}>›</Text>
        </Pressable>

        <SectionLabel className="mt-8 mb-3">Account</SectionLabel>
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
          <Text style={{ fontSize: 18, color: colors.textDim }}>›</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
