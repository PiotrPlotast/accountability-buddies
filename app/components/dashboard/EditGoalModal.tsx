import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Goal } from "@/types/dashboardTypes";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useActiveGroup } from "@/hooks/useActiveGroup";
import { repeatDaysOrAll } from "@/lib/repeatDays";
import HabitFormFields from "@/app/components/habits/HabitFormFields";
import DialogShell from "@/app/components/ui/DialogShell";
import PrimaryButton from "@/app/components/ui/PrimaryButton";

export type GoalEdit = {
  title: string;
  icon: string | null;
  repeatDays: number[];
  reminderTime: string | null;
};

type Props = {
  goal: Goal | null;
  isVisible: boolean;
  onClose: () => void;
  // Replaces the save. The tour edits a sample habit with this sheet, and a
  // sample must never reach the server.
  onSave?: (goalId: string, edit: GoalEdit) => Promise<void>;
};

export default function EditGoalModal({
  goal,
  isVisible,
  onClose,
  onSave,
}: Props) {
  const { activeGroupId } = useActiveGroup();
  const { editGoal } = useDashboardActions(activeGroupId);
  const save = onSave ?? editGoal;

  const [title, setTitle] = useState(goal?.title ?? "");
  const [icon, setIcon] = useState<string | null>(goal?.icon ?? null);
  const [repeatDays, setRepeatDays] = useState<number[]>(
    repeatDaysOrAll(goal?.repeat_days),
  );
  const [reminderTime, setReminderTime] = useState<string | null>(
    goal?.reminder_time ?? null,
  );
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever a habit is opened — during render, React's
  // "adjusting state when a prop changes" pattern, not an effect. `null` (the
  // modal closing) is remembered too, so reopening the same habit re-seeds and
  // drops abandoned edits, while the closing modal keeps its values on screen.
  const [seededFor, setSeededFor] = useState(goal);
  if (goal !== seededFor) {
    setSeededFor(goal);
    if (goal) {
      setTitle(goal.title);
      setIcon(goal.icon);
      setRepeatDays(repeatDaysOrAll(goal.repeat_days));
      setReminderTime(goal.reminder_time ?? null);
    }
  }

  const canSave = title.trim().length > 0 && !saving;

  const dirty =
    !!goal &&
    (title !== goal.title ||
      icon !== goal.icon ||
      repeatDays.join() !== repeatDaysOrAll(goal.repeat_days).join() ||
      reminderTime !== (goal.reminder_time ?? null));

  // Tapping outside closes only when there is nothing to lose. With edits in
  // flight or unsaved, a stray tap on the backdrop would silently discard
  // them, so it does nothing and Cancel stays the deliberate way out.
  const dismissOnBackdrop = !dirty && !saving ? onClose : undefined;

  const handleSave = async () => {
    if (!goal?.id || !canSave) return;
    setSaving(true);
    try {
      await save(goal.id, { title, icon, repeatDays, reminderTime });
      onClose();
    } catch {
      // useOptimisticGoalMutation already surfaced an Alert and rolled the
      // cache back; keep the modal open so the edit isn't lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell
      isVisible={isVisible}
      onRequestClose={onClose}
      onBackdropPress={dismissOnBackdrop}
      backdropLabel="Close"
      cardClassName="bg-bg border border-border rounded-tile overflow-hidden"
    >
      <ScrollView
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <HabitFormFields
          title={title}
          onTitleChange={setTitle}
          titlePlaceholder="Habit name"
          icon={icon}
          onIconChange={setIcon}
          repeatDays={repeatDays}
          onRepeatDaysChange={setRepeatDays}
          reminderTime={reminderTime}
          onReminderTimeChange={setReminderTime}
        />
      </ScrollView>

      <View className="flex-row gap-3 px-6 pb-6">
        <Pressable
          onPress={onClose}
          disabled={saving}
          accessibilityRole="button"
          className="flex-1 h-14 rounded-tile items-center justify-center bg-surface border border-border"
        >
          <Text className="text-text-muted font-mono-medium text-base">
            Cancel
          </Text>
        </Pressable>
        <PrimaryButton
          label="Save"
          onPress={handleSave}
          filled={canSave}
          busy={saving}
          className="flex-1"
        />
      </View>
    </DialogShell>
  );
}
