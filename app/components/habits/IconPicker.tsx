import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { ICON_CHOICES } from "@/lib/habitIcons";

type Props = {
  value: string | null;
  onChange: (icon: string) => void;
};

export default function IconPicker({ value, onChange }: Props) {
  const { accent } = useTheme();

  return (
    <View className="flex-row flex-wrap gap-3">
      {ICON_CHOICES.map((emoji) => {
        const selected = value === emoji;
        return (
          <Pressable
            key={emoji}
            onPress={() => onChange(emoji)}
            accessibilityRole="button"
            accessibilityLabel={emoji}
            accessibilityState={{ selected }}
            style={selected ? { backgroundColor: accent.hex } : undefined}
            className={`w-14 h-14 rounded-tile items-center justify-center ${
              selected ? "" : "bg-surface border border-border"
            }`}
          >
            <Text style={{ fontSize: 24 }}>{emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
