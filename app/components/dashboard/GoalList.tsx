import { View, Text, Pressable, StyleSheet } from "react-native";
import { Goal } from "@/types/dashboardTypes";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDashboardActions } from "@/hooks/useDashboardActions";

type Props = {
  selectedTabId: string | null;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
};

export default function GoalList({ selectedTabId, onEdit, onDelete }: Props) {
  const { members, loading, userId, activeGroupId } = useDashboardData();
  const { toggleGoal } = useDashboardActions(activeGroupId);

  const currentMember = members.find((m) => m.user_id === selectedTabId);
  const goals = currentMember?.goals || [];
  const isViewingMe = selectedTabId === userId;
  const isLoading = loading || (members.length > 0 && !currentMember);

  function RightAction(
    prog: SharedValue<number>,
    drag: SharedValue<number>,
    goal: Goal,
  ) {
    const styleAnimation = useAnimatedStyle(() => ({
      transform: [{ translateX: drag.value + 56 }],
    }));
    return (
      <Reanimated.View style={styleAnimation}>
        <Pressable style={styles.rightAction} onPress={() => onDelete(goal)}>
          <Text style={{ fontSize: 18 }}>🗑️</Text>
        </Pressable>
      </Reanimated.View>
    );
  }

  function LeftAction(
    prog: SharedValue<number>,
    drag: SharedValue<number>,
    goal: Goal,
  ) {
    const styleAnimation = useAnimatedStyle(() => ({
      transform: [{ translateX: drag.value - 56 }],
    }));
    return (
      <Reanimated.View style={styleAnimation}>
        <Pressable style={styles.leftAction} onPress={() => onEdit(goal)}>
          <Text style={{ fontSize: 18 }}>✏️</Text>
        </Pressable>
      </Reanimated.View>
    );
  }

  if (isLoading) {
    return (
      <View style={{ gap: 12 }}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              height: 72,
              backgroundColor: "#151517",
              borderRadius: 14,
              opacity: 0.6,
            }}
          />
        ))}
      </View>
    );
  }

  if (goals.length === 0) {
    return (
      <View className="mt-6 p-6 bg-surface border border-border rounded-tile items-center">
        <Text className="text-text-muted font-mono text-sm text-center">
          {isViewingMe
            ? "No habits yet. Tap + to add one."
            : "Nothing here yet."}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {goals.map((goal) => {
        const done = goal.completed_today;
        return (
          <Swipeable
            key={goal.id}
            renderRightActions={
              isViewingMe
                ? (prog, drag) => RightAction(prog, drag, goal)
                : undefined
            }
            renderLeftActions={
              isViewingMe
                ? (prog, drag) => LeftAction(prog, drag, goal)
                : undefined
            }
            overshootRight={false}
            overshootLeft={false}
            friction={2}
          >
            <Pressable
              disabled={!isViewingMe}
              onPress={() => toggleGoal(goal)}
              className="bg-surface border border-border rounded-tile px-4 py-4 flex-row items-center"
            >
              <View
                className={`w-10 h-10 rounded-tile items-center justify-center mr-3 ${
                  done ? "bg-neon" : "bg-bg border border-border"
                }`}
              >
                {done ? (
                  <Text className="text-bg font-mono-bold text-base">✓</Text>
                ) : goal.icon ? (
                  <Text style={{ fontSize: 18 }}>{goal.icon}</Text>
                ) : null}
              </View>

              <View className="flex-1">
                <Text
                  className={`font-mono-medium text-base ${
                    done ? "text-text-dim" : "text-text"
                  }`}
                  style={
                    done ? { textDecorationLine: "line-through" } : undefined
                  }
                >
                  {goal.title}
                </Text>
                <View className="flex-row items-center gap-1 mt-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <View
                      key={i}
                      className={`w-1.5 h-1.5 rounded-pill ${
                        done && i === 6 ? "bg-neon" : "bg-border"
                      }`}
                    />
                  ))}
                </View>
              </View>

              {done ? <Text style={{ fontSize: 16 }}>🔥</Text> : null}
            </Pressable>
          </Swipeable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rightAction: {
    padding: 20,
    transform: [{ translateX: 16 }],
    backgroundColor: "#EF4444",
    borderRadius: 14,
  },
  leftAction: {
    padding: 20,
    transform: [{ translateX: -16 }],
    backgroundColor: "#FACC15",
    borderRadius: 14,
  },
});
