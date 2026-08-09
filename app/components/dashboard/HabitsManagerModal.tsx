import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Goal } from "@/types/dashboardTypes";

type Props = {
  isVisible: boolean;
  onClose: () => void;
  goals: Goal[];
  isViewingMe: boolean;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
};

export default function HabitManagerModal({
  isVisible,
  onClose,
  goals,
  isViewingMe,
  onEdit,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();

  const formatDays = (days: number[] | null | undefined) => {
    if (!days || days.length === 0 || days.length === 7) return "Every day";
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return [...days]
      .sort((a, b) => a - b)
      .map((d) => dayNames[d - 1])
      .join(", ");
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-bg"
        style={{ paddingTop: insets.top ? insets.top + 10 : 20 }}
      >
        <View className="flex-row items-center justify-between px-5 pb-4 border-b border-border">
          <Text className="text-text font-mono-bold text-xl">All Habits</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            className="bg-surface border border-border px-4 py-2 rounded-pill"
          >
            <Text className="text-text font-mono-medium">Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          {goals.length === 0 ? (
            <Text className="text-text-dim text-center font-mono mt-10">
              No habits found.
            </Text>
          ) : (
            goals.map((goal) => (
              <View
                key={goal.id}
                className="bg-surface border border-border rounded-tile p-4 flex-row items-center justify-between"
              >
                <View className="flex-row items-center flex-1 mr-4">
                  <View className="w-10 h-10 rounded-tile bg-bg border border-border items-center justify-center mr-3">
                    <Text style={{ fontSize: 18 }}>{goal.icon || "🎯"}</Text>
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-text font-semibold text-base"
                      numberOfLines={1}
                    >
                      {goal.title}
                    </Text>
                    <Text className="text-text-muted font-mono text-xs mt-1">
                      {formatDays(goal.repeat_days)}
                    </Text>
                  </View>
                </View>

                {isViewingMe && (
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => {
                        onClose();
                        setTimeout(() => onEdit(goal), 400);
                      }}
                      className="w-10 h-10 rounded-tile bg-bg border border-border items-center justify-center"
                    >
                      <Text style={{ fontSize: 16 }}>✏️</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        onClose();
                        setTimeout(() => onDelete(goal), 400);
                      }}
                      className="w-10 h-10 rounded-tile bg-danger border border-danger items-center justify-center opacity-80"
                    >
                      <Text style={{ fontSize: 16 }}>🗑️</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
