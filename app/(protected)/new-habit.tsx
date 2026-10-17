import "../../global.css";
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActiveGroup } from "@/hooks/useActiveGroup";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useTheme } from "@/hooks/useTheme";
import { DEFAULT_ICON } from "@/lib/habitIcons";
import { themeColors } from "@/lib/colors";
import HabitFormFields from "@/app/components/habits/HabitFormFields";

export default function NewHabitScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeGroupId } = useActiveGroup();
  const { addGoal } = useDashboardActions(activeGroupId);
  const { accent } = useTheme();

  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(DEFAULT_ICON);
  const [repeatDays, setRepeatDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [reminderTime, setReminderTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSave = title.trim().length > 0 && !submitting;

  const handleSave = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      await addGoal(title, { icon, repeatDays, reminderTime });
      router.back();
    } catch {
      // useOptimisticGoalMutation already surfaced an Alert and rolled the
      // cache back; stay on the screen so the habit isn't lost.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-5 h-14">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="w-10 h-10 items-center justify-center"
        >
          <Text className="text-text font-mono-medium text-2xl">‹</Text>
        </Pressable>
        <Text className="text-text font-mono-medium text-base">New habit</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <HabitFormFields
          title={title}
          onTitleChange={setTitle}
          titlePlaceholder="Meditate 10 minutes"
          icon={icon}
          onIconChange={setIcon}
          repeatDays={repeatDays}
          onRepeatDaysChange={setRepeatDays}
          reminderTime={reminderTime}
          onReminderTimeChange={setReminderTime}
        />
      </ScrollView>

      <View
        className="absolute left-0 right-0 bg-bg px-5"
        style={{ bottom: 0, paddingBottom: insets.bottom + 16, paddingTop: 12 }}
      >
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          style={{
            backgroundColor: canSave ? accent.hex : themeColors.surface,
          }}
          className={`h-14 rounded-tile items-center justify-center`}
        >
          {submitting ? (
            <ActivityIndicator color={themeColors.background} />
          ) : (
            <Text
              className={`font-mono-bold text-base ${canSave ? "text-bg" : "text-text-dim"}`}
            >
              Create habit
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
