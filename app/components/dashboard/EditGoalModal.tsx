import { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Goal } from "@/types/dashboardTypes";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useTheme } from "@/hooks/useTheme";
import { ALL_DAYS } from "@/lib/repeatDays";
import IconPicker from "@/app/components/habits/IconPicker";
import DayPicker from "@/app/components/habits/DayPicker";

type Props = {
  goal: Goal | null;
  isVisible: boolean;
  onClose: () => void;
};

export default function EditGoalModal({ goal, isVisible, onClose }: Props) {
  const { activeGroupId } = useDashboardData();
  const { editGoal } = useDashboardActions(activeGroupId);
  const { accent } = useTheme();

  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [repeatDays, setRepeatDays] = useState<number[]>(ALL_DAYS);
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever a different habit is opened.
  useEffect(() => {
    if (!goal) return;
    setTitle(goal.title);
    setIcon(goal.icon);
    setRepeatDays(goal.repeat_days?.length ? goal.repeat_days : ALL_DAYS);
  }, [goal]);

  const canSave = title.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!goal?.id || !canSave) return;
    setSaving(true);
    try {
      await editGoal(goal.id, { title, icon, repeatDays });
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
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View className="bg-surface border border-border rounded-tile overflow-hidden">
          <ScrollView
            contentContainerStyle={{ padding: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
              Edit habit
            </Text>
            <View className="border border-border rounded-tile px-4 h-14 justify-center bg-bg">
              <TextInput
                value={title}
                onChangeText={setTitle}
                autoFocus
                placeholder="Habit name"
                placeholderTextColor="#6B7280"
                className="text-text font-mono text-base"
                style={{ fontFamily: "GeistMono_400Regular" }}
              />
            </View>

            <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-6 mb-3">
              Icon
            </Text>
            <IconPicker value={icon} onChange={setIcon} variant="card" />

            <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-6 mb-3">
              Repeat
            </Text>
            <DayPicker
              value={repeatDays}
              onChange={setRepeatDays}
              variant="card"
            />
          </ScrollView>

          <View className="flex-row gap-3 px-6 pb-6">
            <Pressable
              onPress={onClose}
              disabled={saving}
              className="flex-1 h-12 rounded-tile items-center justify-center bg-bg border border-border"
            >
              <Text className="text-text-muted font-mono-medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              className="flex-1 h-12 rounded-tile items-center justify-center"
              style={{ backgroundColor: canSave ? accent.hex : "#3F3F46" }}
            >
              {saving ? (
                <ActivityIndicator color="#18181B" />
              ) : (
                <Text
                  className={`font-mono-bold ${
                    canSave ? "text-bg" : "text-text-dim"
                  }`}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
