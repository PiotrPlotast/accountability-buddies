import { useState } from "react";
import { View, Text, Pressable, Switch, Platform } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { useTheme } from "@/hooks/useTheme";
import { themeColors } from "@/lib/colors";
import { tapLight } from "@/lib/haptics";
import { dateToHHMM, formatReminderTime, hhmmToDate } from "@/lib/reminderTime";

type Props = {
  label: string;
  // `"HH:MM"`, or null when off.
  value: string | null;
  onChange: (hhmm: string | null) => void;
  // What switching it on picks.
  defaultTime?: string;
  // False for a time that is always set (quiet hours' from/to): no switch.
  allowOff?: boolean;
};

/**
 * A time row in the tile style of `ToggleRow`, shared by the habit forms (the
 * reminder) and notification settings (quiet hours). iOS shows the native
 * compact picker inline; Android has only a dialog, so the time is a button
 * that opens it.
 */
export default function TimePicker({
  label,
  value,
  onChange,
  defaultTime = "09:00",
  allowOff = true,
}: Props) {
  const { accent } = useTheme();
  const [androidOpen, setAndroidOpen] = useState(false);
  const isIOS = Platform.OS === "ios";

  const handlePick = (event: DateTimePickerEvent, date?: Date) => {
    if (!isIOS) setAndroidOpen(false);
    if (event.type !== "set" || !date) return;
    onChange(dateToHHMM(date));
  };

  const toggle = (on: boolean) => {
    tapLight();
    onChange(on ? defaultTime : null);
  };

  return (
    <View className="bg-surface border border-border rounded-tile px-4 py-3 flex-row items-center gap-3 min-h-14">
      <Text className="flex-1 text-text font-mono-medium text-base">
        {label}
      </Text>

      {value && isIOS ? (
        <DateTimePicker
          mode="time"
          display="compact"
          value={hhmmToDate(value)}
          onChange={handlePick}
          themeVariant="dark"
          accentColor={accent.hex}
        />
      ) : null}

      {value && !isIOS ? (
        <Pressable
          onPress={() => setAndroidOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${label} time`}
          hitSlop={8}
        >
          <Text
            className="font-mono-medium text-base"
            style={{ color: accent.hex }}
          >
            {formatReminderTime(value)}
          </Text>
        </Pressable>
      ) : null}

      {allowOff ? (
        <Switch
          value={!!value}
          onValueChange={toggle}
          accessibilityLabel={label}
          trackColor={{ false: themeColors.surface2, true: accent.dim }}
          thumbColor={value ? accent.hex : themeColors.textDim}
        />
      ) : null}

      {value && !isIOS && androidOpen ? (
        <DateTimePicker
          mode="time"
          value={hhmmToDate(value)}
          onChange={handlePick}
        />
      ) : null}
    </View>
  );
}
