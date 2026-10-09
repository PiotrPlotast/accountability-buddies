import { View, Text, Pressable } from "react-native";

import { useTheme } from "@/hooks/useTheme";

/**
 * A read failed but the cache still has the group, so the habits stay on
 * screen and this says they may be out of date. It goes away by itself on the
 * next read that succeeds.
 */
export function OfflineBanner() {
  return (
    <View className="mx-5 mt-3 rounded-tile border border-border bg-surface px-4 py-3">
      <Text className="text-text-muted font-mono text-xs text-center">
        Offline. Showing your last update.
      </Text>
    </View>
  );
}

type RetryProps = {
  onRetry: () => void;
  retrying: boolean;
};

/**
 * A read failed and there is nothing cached to show: an offline first launch,
 * or a cache cleared by sign-out. Pull-to-refresh works here too.
 */
export function OfflineRetry({ onRetry, retrying }: RetryProps) {
  const { accent } = useTheme();

  return (
    <View className="flex-1 items-center px-8" style={{ paddingTop: 160 }}>
      <Text className="text-text font-mono-bold text-lg text-center">
        Can&apos;t reach Habit Pals
      </Text>
      <Text className="text-text-muted font-mono text-sm text-center mt-2">
        Check your connection and try again.
      </Text>
      <Pressable
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityState={{ disabled: retrying }}
        style={{ borderColor: accent.hex, opacity: retrying ? 0.5 : 1 }}
        className="mt-6 h-12 px-8 rounded-tile border items-center justify-center"
      >
        <Text
          style={{ color: accent.hex }}
          className="font-mono-medium text-sm"
        >
          {retrying ? "Retrying…" : "Retry"}
        </Text>
      </Pressable>
    </View>
  );
}
