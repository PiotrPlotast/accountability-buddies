import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import EmojiPicker from "rn-emoji-keyboard";
import { useTheme } from "@/hooks/useTheme";
import { tapLight } from "@/lib/haptics";
import { themeColors } from "@/lib/colors";
import {
  IconKind,
  defaultIconRecents,
  loadIconRecents,
  pushIconRecent,
  saveIconRecents,
  withSelectedIcon,
} from "@/lib/iconRecents";

type Props = {
  value: string | null;
  onChange: (icon: string) => void;
  kind?: IconKind;
};

// See DayPicker: unselected tiles are `bg-surface`, so they need a `bg-bg`
// surface behind them to stay visible.
export default function IconPicker({ value, onChange, kind = "habit" }: Props) {
  const { accent } = useTheme();
  const [recents, setRecents] = useState(() => defaultIconRecents(kind));
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadIconRecents(kind).then((row) => {
      if (!cancelled) setRecents(row);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const pickFromSheet = (emoji: string) => {
    const next = pushIconRecent(recents, emoji);
    setRecents(next);
    saveIconRecents(kind, next);
    onChange(emoji);
  };

  return (
    <View className="flex-row flex-wrap gap-3">
      {withSelectedIcon(recents, value).map((emoji) => {
        const selected = value === emoji;
        return (
          <Pressable
            key={emoji}
            onPress={() => {
              tapLight();
              onChange(emoji);
            }}
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
      <Pressable
        onPress={() => {
          tapLight();
          setPickerOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="More emoji"
        className="w-14 h-14 rounded-tile items-center justify-center bg-surface border border-border"
      >
        <Text className="text-text-muted" style={{ fontSize: 24 }}>
          +
        </Text>
      </Pressable>
      <EmojiPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onEmojiSelected={(e) => pickFromSheet(e.emoji)}
        enableSearchBar
        categoryPosition="top"
        theme={{
          backdrop: "#00000080",
          knob: themeColors.textDim,
          container: themeColors.background,
          header: themeColors.text,
          skinTonesContainer: themeColors.surface,
          category: {
            icon: themeColors.textMuted,
            iconActive: accent.hex,
            container: themeColors.surface,
            containerActive: themeColors.surface2,
          },
          search: {
            background: themeColors.surface,
            text: themeColors.text,
            placeholder: themeColors.textDim,
            icon: themeColors.textMuted,
          },
          emoji: { selected: themeColors.surface2 },
        }}
      />
    </View>
  );
}
