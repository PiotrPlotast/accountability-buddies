import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
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
    <Modal visible={isVisible} animationType="fade" transparent={true}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.content}>
          <Text style={styles.label}>Delete Habit</Text>
          <View style={styles.buttonGroup}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={async () => {
                if (goal?.id) {
                  await deleteGoal(goal.id);
                  onClose();
                }
              }}
            >
              <Text style={styles.saveText}>Delete Habit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)", // Dims the background
    justifyContent: "center",
    padding: 20,
  },
  content: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  label: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    color: "#1e293b",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    marginBottom: 20,
  },
  buttonGroup: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, padding: 15, alignItems: "center" },
  saveBtn: {
    flex: 2,
    backgroundColor: "#4f46e5", // Indigo to match your theme
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelText: { color: "#64748b", fontWeight: "600" },
  saveText: { color: "white", fontWeight: "700" },
});
