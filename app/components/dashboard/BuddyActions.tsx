import { View, Text, Pressable } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import NeedsConnection from "@/app/components/ui/NeedsConnection";

type Props = {
  name: string;
  onNudge: () => void;
  onCheer: () => void;
  // "Nudge sent to Ada" or "Cheer sent to Ada", for a few seconds after one
  // went through.
  sentNotice: string | null;
  // Offline: neither can be queued, it would arrive hours late.
  disabled?: boolean;
};

/**
 * A buddy's tab gets these where your own tab has "Add a new habit": the same
 * slot and height, so the dashboard reads the same on every tab. Both stay
 * whether or not the buddy has finished their day, and whether they have
 * switched either kind off is theirs to know. Cheer here is a day cheer; a
 * habit cheer is the swipe on a ticked habit.
 */
export default function BuddyActions({
  name,
  onNudge,
  onCheer,
  sentNotice,
  disabled = false,
}: Props) {
  const { accent } = useTheme();

  const button = (emoji: string, label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{ borderColor: accent.hex, opacity: disabled ? 0.4 : 1 }}
      className="flex-1 h-14 rounded-tile border flex-row items-center justify-center gap-2 px-2"
    >
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
      <Text
        numberOfLines={1}
        style={{ color: accent.hex, flexShrink: 1 }}
        className="font-mono-medium text-sm"
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View className="mb-3">
      <View className="flex-row gap-3">
        {button("👋", `Nudge ${name}`, onNudge)}
        {button("🎉", `Cheer ${name}`, onCheer)}
      </View>
      {disabled ? <NeedsConnection /> : null}
      {sentNotice ? (
        <Text className="text-text-muted font-mono text-xs text-center mt-2">
          {sentNotice}
        </Text>
      ) : null}
    </View>
  );
}
