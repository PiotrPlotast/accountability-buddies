import { View, Text, Pressable } from "react-native";
import { Goal } from "@/types/dashboardTypes";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useTheme } from "@/hooks/useTheme";
import { getGoalHistory, type HistoryState } from "@/lib/goalHistory";
import { themeColors } from "@/lib/colors";

const ACTION_WIDTH = 72;
const ACTION_GAP = 8;

type Props = {
  selectedTabId: string | null;
  goals: Goal[];
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
};

type ActionProps = {
  drag: SharedValue<number>;
  goal: Goal;
  onAction: (goal: Goal) => void;
};

function RightActionComponent({ drag, goal, onAction }: ActionProps) {
  const styleAnimation = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + ACTION_WIDTH + ACTION_GAP }],
  }));
  return (
    <Reanimated.View style={styleAnimation}>
      <Pressable
        onPress={() => onAction(goal)}
        style={{ width: ACTION_WIDTH, marginLeft: ACTION_GAP }}
        className="px-4 py-4 rounded-tile bg-danger items-center justify-center"
      >
        <Text style={{ fontSize: 18 }}>🗑️</Text>
        <Text className="text-text font-mono-medium uppercase text-[10px] tracking-widest mt-1">
          Delete
        </Text>
      </Pressable>
    </Reanimated.View>
  );
}

function LeftActionComponent({ drag, goal, onAction }: ActionProps) {
  const styleAnimation = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value - ACTION_WIDTH - ACTION_GAP }],
  }));
  return (
    <Reanimated.View style={styleAnimation}>
      <Pressable
        onPress={() => onAction(goal)}
        style={{ width: ACTION_WIDTH, marginRight: ACTION_GAP }}
        className="px-4 py-4 rounded-tile bg-warning items-center justify-center"
      >
        <Text style={{ fontSize: 18 }}>✏️</Text>
        <Text className="text-bg font-mono-medium uppercase text-[10px] tracking-widest mt-1">
          Edit
        </Text>
      </Pressable>
    </Reanimated.View>
  );
}

// The trailing week for one habit, oldest dot first.
//
// Every dot has to stay visible against the row's own `bg-surface`, so the
// dimmer states are the palette greys at reduced opacity rather than a colour
// close to the card — painting one *as* the card colour makes it vanish and
// the strip silently loses a day.
export const DOT_STYLES: Record<
  HistoryState,
  (accentHex: string) => { backgroundColor: string; opacity: number }
> = {
  done: (accentHex) => ({ backgroundColor: accentHex, opacity: 1 }),
  // Today, still due — accent-tinted so it reads as "this one's on you".
  pending: (accentHex) => ({ backgroundColor: accentHex, opacity: 0.35 }),
  missed: () => ({ backgroundColor: themeColors.surface2, opacity: 1 }),
  off: () => ({ backgroundColor: themeColors.surface2, opacity: 0.45 }),
};

function WeekStrip({ goal, accentHex }: { goal: Goal; accentHex: string }) {
  const cells = getGoalHistory(goal);
  const doneCount = cells.filter((c) => c.state === "done").length;

  return (
    <View
      className="flex-row items-center gap-1 mt-2"
      accessible
      accessibilityLabel={`${doneCount} of the last ${cells.length} days completed`}
    >
      {cells.map((cell) => (
        <View
          key={cell.date}
          className="w-1.5 h-1.5 rounded-pill"
          style={DOT_STYLES[cell.state](accentHex)}
        />
      ))}
    </View>
  );
}

export default function GoalList({
  selectedTabId,
  goals,
  onEdit,
  onDelete,
}: Props) {
  const { members, loading, userId, activeGroupId } = useDashboardData();
  const { toggleGoal } = useDashboardActions(activeGroupId);
  const { accent } = useTheme();

  const currentMember = members.find((m) => m.user_id === selectedTabId);
  const isViewingMe = selectedTabId === userId;
  const isLoading = loading || (members.length > 0 && !currentMember);

  if (isLoading) {
    return (
      <View style={{ gap: 12 }}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              height: 72,
              backgroundColor: themeColors.surface,
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
            ? "No habits for today. Tap + to add one."
            : "Nothing here for today."}
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
                ? (prog, drag) => (
                    <RightActionComponent
                      drag={drag}
                      goal={goal}
                      onAction={onDelete}
                    />
                  )
                : undefined
            }
            renderLeftActions={
              isViewingMe
                ? (prog, drag) => (
                    <LeftActionComponent
                      drag={drag}
                      goal={goal}
                      onAction={onEdit}
                    />
                  )
                : undefined
            }
            overshootRight={false}
            overshootLeft={false}
            friction={2}
          >
            <Pressable
              disabled={!isViewingMe}
              onPress={() => toggleGoal(goal)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done, disabled: !isViewingMe }}
              accessibilityLabel={goal.title}
              className={`bg-surface border border-border rounded-tile px-4 py-4 flex-row items-center ${
                done ? "opacity-60" : ""
              }`}
            >
              <View
                className={`w-10 h-10 rounded-tile items-center justify-center mr-3 ${
                  done ? "" : "bg-bg border border-border"
                }`}
                style={done ? { backgroundColor: accent.hex } : undefined}
              >
                {done ? (
                  <Text className="text-bg font-mono-bold text-base">✓</Text>
                ) : goal.icon ? (
                  <Text style={{ fontSize: 18 }}>{goal.icon}</Text>
                ) : null}
              </View>

              <View className="flex-1">
                <Text
                  className={`text-base font-semibold tracking-tight ${
                    done ? "text-text-dim line-through" : "text-text"
                  }`}
                >
                  {goal.title}
                </Text>
                <WeekStrip goal={goal} accentHex={accent.hex} />
              </View>

              {done ? <Text style={{ fontSize: 16 }}>🔥</Text> : null}
            </Pressable>
          </Swipeable>
        );
      })}
    </View>
  );
}
