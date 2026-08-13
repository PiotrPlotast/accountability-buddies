import { View, Text } from "react-native";

type Props = {
  message: string | null;
};

// Renders nothing when there is no error, so it can sit unconditionally in a
// `gap`-spaced form without leaving a hole.
export default function FormError({ message }: Props) {
  if (!message) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="bg-surface border border-danger rounded-tile px-4 py-3"
    >
      <Text className="text-danger font-mono text-sm">{message}</Text>
    </View>
  );
}
