import { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Goal } from "@/types/dashboardTypes";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useActiveGroup } from "@/hooks/useActiveGroup";
import { useTheme } from "@/hooks/useTheme";
import { repeatDaysOrAll } from "@/lib/repeatDays";
import { themeColors } from "@/lib/colors";
import HabitFormFields from "@/app/components/habits/HabitFormFields";

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
  const { accent } = useTheme();

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
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable
          onPress={dismissOnBackdrop}
          accessibilityRole={dismissOnBackdrop ? "button" : undefined}
          accessibilityLabel={dismissOnBackdrop ? "Close" : undefined}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          {/* Absorbs taps landing on the dialog so they don't reach the
              backdrop. A plain responder rather than a Pressable, so the card
              doesn't announce itself as a button. */}
          <View
            onStartShouldSetResponder={() => true}
            className="bg-bg border border-border rounded-tile overflow-hidden"
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
                className="flex-1 h-14 rounded-tile items-center justify-center bg-surface border border-border"
              >
                <Text className="text-text-muted font-mono-medium text-base">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={!canSave}
                className="flex-1 h-14 rounded-tile items-center justify-center"
                style={{
                  backgroundColor: canSave ? accent.hex : themeColors.surface,
                }}
              >
                {saving ? (
                  <ActivityIndicator color={themeColors.background} />
                ) : (
                  <Text
                    className={`font-mono-bold text-base ${
                      canSave ? "text-bg" : "text-text-dim"
                    }`}
                  >
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
