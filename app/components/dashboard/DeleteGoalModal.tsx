import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Goal } from "@/types/dashboardTypes";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useActiveGroup } from "@/hooks/useActiveGroup";
import DialogShell from "@/app/components/ui/DialogShell";

type Props = {
  goal: Goal | null;
  isVisible: boolean;
  onClose: () => void;
  // Replaces the delete, for the tour's sample habits.
  onConfirm?: (goal: Goal) => Promise<void>;
};

export default function DeleteGoalModal({
  goal,
  isVisible,
  onClose,
  onConfirm,
}: Props) {
  const { activeGroupId } = useActiveGroup();
  const { deleteGoal } = useDashboardActions(activeGroupId);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!goal?.id || deleting) return;
    setDeleting(true);
    try {
      if (onConfirm) {
        await onConfirm(goal);
      } else {
        await deleteGoal(goal.id, goal.title);
      }
      onClose();
    } catch {
      // useOptimisticGoalMutation already surfaced an Alert and rolled the
      // cache back; keep the modal open so the user can retry or cancel.
    } finally {
      setDeleting(false);
    }
  };

  return (
    // Tapping outside cancels — the safe half of a destructive choice.
    // Ignored mid-delete so the sheet can't vanish under the request.
    <DialogShell
      isVisible={isVisible}
      onRequestClose={onClose}
      onBackdropPress={deleting ? undefined : onClose}
      backdropLabel="Cancel"
    >
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
    </DialogShell>
  );
}
