import { View, Text, Pressable } from "react-native";

import { useTheme } from "@/hooks/useTheme";

type Props = {
  name: string;
  onPress: () => void;
  // True for a few seconds after a nudge to this buddy went through.
  sent: boolean;
};

/**
 * A buddy's tab gets this where your own tab has "Add a new habit": the same
 * slot and shape, so the dashboard reads the same on every tab. It stays the
 * same whether or not the buddy has finished their day — a cheer is still
 * welcome, and whether they have switched nudges off is theirs to know.
 */
export default function NudgeButton({ name, onPress, sent }: Props) {
  const { accent } = useTheme();

  return (
    <View className="mb-3">
      <Pressable
        onPress={onPress}
        style={{ borderColor: accent.hex }}
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
      {sent ? (
        <Text className="text-text-muted font-mono text-xs text-center mt-2">
          {`Nudge sent to ${name}`}
        </Text>
      ) : null}
    </View>
  );
}
