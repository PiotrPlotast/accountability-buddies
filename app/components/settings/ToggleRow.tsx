import { View, Text, Switch } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { themeColors } from "@/lib/colors";

interface Props {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}

/**
 * A labelled switch in a tile, extracted from the haptics row that used to sit
 * on `Profile.tsx`. The accent colours are inline styles, not classes — the
 * accent is runtime state and Tailwind generates nothing for it.
 *
 * `accessibilityLabel` is the label and nothing else: the description sits
 * beside the switch and would otherwise be announced as an unrelated blob.
 */
export default function ToggleRow({
  label,
  description,
  value,
  disabled,
  onValueChange,
}: Props) {
  const { accent } = useTheme();

  return (
    <View className="bg-surface border border-border rounded-tile px-4 py-4 flex-row items-center gap-3">
      <View className="flex-1">
        <Text className="text-text font-mono-medium text-base">{label}</Text>
        {description ? (
          <Text className="text-text-muted font-mono text-xs mt-1">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ false: themeColors.surface2, true: accent.dim }}
        thumbColor={value ? accent.hex : themeColors.textDim}
      />
    </View>
  );
}
