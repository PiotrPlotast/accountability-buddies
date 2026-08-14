import { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Goal } from "@/types/dashboardTypes";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useDashboardData } from "@/hooks/useDashboardData";

type Props = {
  goal: Goal | null;
  isVisible: boolean;
  onClose: () => void;
};

export default function DeleteGoalModal({ goal, isVisible, onClose }: Props) {
  const { activeGroupId } = useDashboardData();
  const { deleteGoal } = useDashboardActions(activeGroupId);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!goal?.id || deleting) return;
    setDeleting(true);
    try {
      await deleteGoal(goal.id);
      onClose();
    } catch {
      // useOptimisticGoalMutation already surfaced an Alert and rolled the
      // cache back; keep the modal open so the user can retry or cancel.
    } finally {
      setDeleting(false);
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
        <View className="bg-surface border border-border rounded-tile p-6">
          <Text className="text-text font-mono-bold text-lg mb-2">
            Delete habit?
          </Text>
          <Text className="text-text-muted font-mono text-sm mb-5">
            {goal?.title ? `"${goal.title}" will be removed.` : ""}
          </Text>
          <View className="flex-row gap-3">
            <Pressable
              onPress={onClose}
              disabled={deleting}
              className="flex-1 h-12 rounded-tile items-center justify-center bg-bg border border-border"
            >
              <Text className="text-text-muted font-mono-medium">Cancel</Text>
            </Pressable>
            <Pressable
              className="flex-1 h-12 rounded-tile items-center justify-center bg-danger"
              disabled={deleting}
              onPress={handleDelete}
            >
              <Text className="text-text font-mono-bold">
                {deleting ? "Deleting…" : "Delete"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
