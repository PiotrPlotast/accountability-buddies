import { View, Text, Pressable } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import NeedsConnection from "@/app/components/ui/NeedsConnection";

type Props = {
  name: string;
  onPress: () => void;
  // True for a few seconds after a nudge to this buddy went through.
  sent: boolean;
  // Offline: a nudge can't be queued, it would arrive hours late.
  disabled?: boolean;
};

/**
 * A buddy's tab gets this where your own tab has "Add a new habit": the same
 * slot and shape, so the dashboard reads the same on every tab. It stays the
 * same whether or not the buddy has finished their day — a cheer is still
 * welcome, and whether they have switched nudges off is theirs to know.
 */
export default function NudgeButton({
  name,
  onPress,
  sent,
  disabled = false,
}: Props) {
  const { accent } = useTheme();

  return (
    <View className="mb-3">
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={{ borderColor: accent.hex, opacity: disabled ? 0.4 : 1 }}
        className="h-14 rounded-tile border flex-row items-center justify-center gap-2"
      >
        <Text style={{ fontSize: 16 }}>👋</Text>
        <Text
          style={{ color: accent.hex }}
          className="font-mono-medium text-sm"
        >
          {`Nudge ${name}`}
        </Text>
      </Pressable>
      {disabled ? <NeedsConnection /> : null}
      {sent ? (
        <Text className="text-text-muted font-mono text-xs text-center mt-2">
          {`Nudge sent to ${name}`}
        </Text>
      ) : null}
    </View>
  );
}
