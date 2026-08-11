import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { DAY_LABELS, DAY_NAMES } from "@/lib/repeatDays";

type Props = {
  value: number[];
  onChange: (days: number[]) => void;
};

// Indexes are on the stored Monday = 0 scale — see lib/repeatDays.ts.
// Both call sites sit on a `bg-bg` surface, so unselected chips are
// `bg-surface`; they'd disappear on anything already that colour.
export default function DayPicker({ value, onChange }: Props) {
  const { accent } = useTheme();

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
              selected ? "" : "bg-surface border border-border"
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
