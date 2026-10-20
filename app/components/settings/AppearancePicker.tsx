import { View, Text, Pressable } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { tapLight } from "@/lib/haptics";
import type { ColorMode } from "@/lib/colors";

const OPTIONS: { mode: ColorMode; label: string }[] = [
  { mode: "system", label: "System" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
];

/**
 * System / Light / Dark, in the tile style of `ToggleRow`. Per device like
 * the accent and haptics, so it needs no connection. A radio group, not
 * tabs: picking one changes a setting, it doesn't swap the content below.
 */
export default function AppearancePicker() {
  const { accent, colorMode, setColorMode } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Appearance"
      className="bg-surface border border-border rounded-tile p-1 flex-row gap-1"
    >
      {OPTIONS.map(({ mode, label }) => {
        const selected = mode === colorMode;
        return (
          <Pressable
            key={mode}
            onPress={() => {
              tapLight();
              setColorMode(mode);
            }}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected }}
            className="flex-1 h-11 rounded-tile items-center justify-center"
            style={selected ? { backgroundColor: accent.hex } : undefined}
          >
            <Text
              className={`font-mono-medium text-sm ${selected ? "text-bg" : "text-text-muted"}`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
