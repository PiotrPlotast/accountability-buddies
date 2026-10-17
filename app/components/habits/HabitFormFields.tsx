import { View, Text } from "react-native";
import AppTextInput from "@/app/components/ui/AppTextInput";
import SectionLabel from "@/app/components/ui/SectionLabel";
import { useTheme } from "@/hooks/useTheme";
import { DEFAULT_REMINDER_TIME } from "@/lib/reminderTime";
import { MAX_HABIT_TITLE_LENGTH } from "@/lib/textLimits";
import IconPicker from "./IconPicker";
import DayPicker from "./DayPicker";
import TimePicker from "./TimePicker";

type Props = {
  title: string;
  onTitleChange: (title: string) => void;
  titlePlaceholder: string;
  icon: string | null;
  onIconChange: (icon: string) => void;
  repeatDays: number[];
  onRepeatDaysChange: (days: number[]) => void;
  reminderTime: string | null;
  onReminderTimeChange: (time: string | null) => void;
};

/**
 * A habit's four fields, shared by `new-habit` and `EditGoalModal`. They own
 * the state and the save; this only lays the fields out, so the two forms
 * can't drift apart again (the edit sheet had lost the reminder hint).
 */
export default function HabitFormFields({
  title,
  onTitleChange,
  titlePlaceholder,
  icon,
  onIconChange,
  repeatDays,
  onRepeatDaysChange,
  reminderTime,
  onReminderTimeChange,
}: Props) {
  const { accent } = useTheme();

  return (
    <>
      <Label first>Habit name</Label>
      <View
        style={{ borderColor: accent.hex }}
        className="border-2 rounded-tile px-4 h-14 justify-center bg-bg"
      >
        <AppTextInput
          value={title}
          onChangeText={onTitleChange}
          placeholder={titlePlaceholder}
          maxLength={MAX_HABIT_TITLE_LENGTH}
          className="text-text text-base"
          autoFocus
        />
      </View>

      <Label>Pick an icon</Label>
      <IconPicker value={icon} onChange={onIconChange} />

      <Label>Repeat</Label>
      <DayPicker value={repeatDays} onChange={onRepeatDaysChange} />

      <Label>Remind me</Label>
      <TimePicker
        label="Reminder"
        value={reminderTime}
        onChange={onReminderTimeChange}
        defaultTime={DEFAULT_REMINDER_TIME}
      />
      <Text className="text-text-dim font-mono text-xs mt-2">
        Only if you haven&apos;t ticked it off yet.
      </Text>
    </>
  );
}

function Label({ children, first }: { children: string; first?: boolean }) {
  return (
    <SectionLabel className={first ? "mb-3" : "mt-8 mb-3"}>
      {children}
    </SectionLabel>
  );
}
