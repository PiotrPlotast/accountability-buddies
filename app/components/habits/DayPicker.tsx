import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { DAY_LABELS, DAY_NAMES } from "@/lib/repeatDays";

type Props = {
  value: number[];
  onChange: (days: number[]) => void;
  // Unselected chips need to contrast with whatever sits behind them: on a
  // `bg-bg` screen that means `bg-surface`, but inside a `bg-surface` card it
  // has to invert or the chips vanish into the card.
  variant?: "page" | "card";
};

// Indexes are on the stored Monday = 0 scale — see lib/repeatDays.ts.
export default function DayPicker({
  value,
  onChange,
  variant = "page",
}: Props) {
  const { accent } = useTheme();
  const unselected =
    variant === "card"
      ? "bg-bg border border-border"
      : "bg-surface border border-border";

  const toggle = (day: number) =>
    onChange(
      value.includes(day)
        ? value.filter((d) => d !== day)
        : [...value, day].sort((a, b) => a - b),
    );

  return (
    <View className="flex-row gap-2">
      {DAY_LABELS.map((label, idx) => {
        const selected = value.includes(idx);
        return (
          <Pressable
            key={idx}
            onPress={() => toggle(idx)}
            accessibilityRole="button"
            // The visible labels repeat (T/T, S/S), so expose the full name.
            accessibilityLabel={DAY_NAMES[idx]}
            accessibilityState={{ selected }}
            style={selected ? { backgroundColor: accent.hex } : undefined}
            className={`flex-1 h-12 rounded-tile items-center justify-center ${
              selected ? "" : unselected
            }`}
          >
            <Text
              className={`font-mono-medium ${
                selected ? "text-bg" : "text-text-muted"
              }`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
