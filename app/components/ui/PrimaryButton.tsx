import { ActivityIndicator, Pressable, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

type Props = {
  label: string;
  onPress: () => void;
  // The form has what it needs: the accent fill and a `text-on-accent` label. Unfilled is
  // the grey `surface` tile with a dim label, and can't be pressed.
  filled: boolean;
  // A request is in flight. The fill stays (the `bg`-coloured spinner needs it) rather
  // than greying out mid-submit, and a second press is refused.
  busy?: boolean;
  // Refuses presses without changing the look, e.g. offline.
  disabled?: boolean;
  // Layout only (`flex-1`, `mt-2`); the shape is the button's own.
  className?: string;
  // The auth screens' label is the default size, every other screen's `text-base`.
  smallLabel?: boolean;
};

/**
 * The accent "Save / Continue" button. The fill is a plain style object,
 * never a `({ pressed }) => …` function: beside a className NativeWind drops
 * a function outright, which is how the tour's Next button went invisible.
 */
export default function PrimaryButton({
  label,
  onPress,
  filled,
  busy = false,
  disabled = false,
  className = "",
  smallLabel = false,
}: Props) {
  const { accent, colors } = useTheme();
  const inactive = !filled || busy || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      className={`h-14 rounded-tile items-center justify-center ${className}`}
      style={{ backgroundColor: filled ? accent.hex : colors.surface }}
    >
      {busy ? (
        <ActivityIndicator
          testID="primary-button-spinner"
          color={colors.onAccent}
        />
      ) : (
        <Text
          className={`font-mono-bold ${smallLabel ? "" : "text-base"} ${
            filled ? "text-on-accent" : "text-text-dim"
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
