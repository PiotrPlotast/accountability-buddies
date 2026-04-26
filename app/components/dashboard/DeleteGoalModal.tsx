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

  return (
    <Modal visible={isVisible} animationType="fade" transparent>
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
              className="flex-1 h-12 rounded-tile items-center justify-center bg-bg border border-border"
            >
              <Text className="text-text-muted font-mono-medium">Cancel</Text>
            </Pressable>
            <Pressable
              className="flex-1 h-12 rounded-tile items-center justify-center bg-danger"
              onPress={async () => {
                if (goal?.id) {
                  await deleteGoal(goal.id);
                  onClose();
                }
              }}
            >
              <Text className="text-text font-mono-bold">Delete</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
