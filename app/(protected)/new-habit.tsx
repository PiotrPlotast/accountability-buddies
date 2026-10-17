import "../../global.css";
import { useState } from "react";
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActiveGroup } from "@/hooks/useActiveGroup";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { DEFAULT_ICON } from "@/lib/habitIcons";
import HabitFormFields from "@/app/components/habits/HabitFormFields";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import ScreenHeader from "@/app/components/ui/ScreenHeader";

export default function NewHabitScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeGroupId } = useActiveGroup();
  const { addGoal } = useDashboardActions(activeGroupId);

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
      <ScreenHeader title="New habit" />

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
        <PrimaryButton
          label="Create habit"
          onPress={handleSave}
          filled={canSave}
          busy={submitting}
        />
      </View>
    </View>
  );
}
