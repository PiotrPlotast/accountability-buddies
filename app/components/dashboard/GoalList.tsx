import { useEffect } from "react";
import { View, Text, Pressable, type ViewStyle } from "react-native";
import { Goal } from "@/types/dashboardTypes";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  Easing,
  SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useTheme } from "@/hooks/useTheme";
import { getGoalHistory, type HistoryState } from "@/lib/goalHistory";
import { themeColors } from "@/lib/colors";

const ACTION_WIDTH = 72;
const ACTION_GAP = 8;

// Rozmiar kropki trzymamy tutaj, a nie w klasie Tailwinda, bo NativeWind nie
// obsługuje `className` na `Reanimated.View` — pulsująca kropka i statyczne
// muszą brać wymiar z jednego miejsca, inaczej rozjadą się przy pierwszej
// zmianie.
const DOT_SIZE = 6;
const DOT_BASE: ViewStyle = {
  width: DOT_SIZE,
  height: DOT_SIZE,
  borderRadius: DOT_SIZE / 2,
};

// Pół oddechu. Pełny cykl to dwa razy tyle, czyli ~1,8 s — wolno na tyle, żeby
// czytać się jako „to żyje”, a nie jako miganie.
const PULSE_MS = 900;
const PULSE_MIN_OPACITY = 0.55;

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
// The accent fill means done, and nothing else in the strip uses it — so the
// week reads in one pass by counting the bright dots. Today, while still open,
// used to be the accent at 35%; a weaker version of "done" reads as "partly
// done", which is not what "you haven't got to this yet" means. It is now the
// accent at full strength, told apart by a slow pulse. A dimmed hue is a
// metaphor for *amount*; motion is a metaphor for *state*.
//
// These static styles are also the Reduce Motion fallback, which is why
// `pending` here is a bright neutral rather than the accent: with no pulse to
// separate them, a full-strength accent dot would be indistinguishable from a
// completed day. `PendingDot` paints the accent back on when it animates.
//
// Every state has to stay visible against the row's own `bg-surface`. The grey
// states are palette greys at reduced opacity rather than a colour close to
// the card; painting one *as* the card colour makes it vanish and the strip
// silently loses a day.
export const DOT_STYLES: Record<
  HistoryState,
  (accentHex: string) => ViewStyle
> = {
  done: (accentHex) => ({ backgroundColor: accentHex }),
  pending: () => ({ backgroundColor: themeColors.textMuted }),
  missed: () => ({ backgroundColor: themeColors.surface2 }),
  off: () => ({ backgroundColor: themeColors.surface2, opacity: 0.45 }),
};

// Today, still open. Every one of these on screen reads the same `pulse`, so
// the cost is one timing loop for the whole list rather than one per habit.
function PendingDot({
  accentHex,
  pulse,
}: {
  accentHex: string;
  pulse: SharedValue<number>;
}) {
  const styleAnimation = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Reanimated.View
      style={[DOT_BASE, { backgroundColor: accentHex }, styleAnimation]}
    />
  );
}

function WeekStrip({
  goal,
  accentHex,
  pulse,
  reduceMotion,
}: {
  goal: Goal;
  accentHex: string;
  pulse: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const cells = getGoalHistory(goal);
  const doneCount = cells.filter((c) => c.state === "done").length;

  return (
    <View
      className="flex-row items-center gap-1 mt-2"
      accessible
      accessibilityLabel={`${doneCount} of the last ${cells.length} days completed`}
    >
      {cells.map((cell) =>
        cell.state === "pending" && !reduceMotion ? (
          <PendingDot key={cell.date} accentHex={accentHex} pulse={pulse} />
        ) : (
          <View
            key={cell.date}
            style={[DOT_BASE, DOT_STYLES[cell.state](accentHex)]}
          />
        ),
      )}
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

  // Jeden zegar na całą listę — `WeekStrip` tylko go czyta. Musi stać przed
  // wcześniejszymi `return`ami niżej, więc żyje tutaj, a nie w `WeekStrip`.
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;

    pulse.value = withRepeat(
      withTiming(PULSE_MIN_OPACITY, {
        duration: PULSE_MS,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );

    return () => cancelAnimation(pulse);
  }, [reduceMotion, pulse]);

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
            ? 'No habits for today. Tap "Add a new habit" to start one.'
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
                <WeekStrip
                  goal={goal}
                  accentHex={accent.hex}
                  pulse={pulse}
                  reduceMotion={reduceMotion}
                />
              </View>

              {done ? <Text style={{ fontSize: 16 }}>🔥</Text> : null}
            </Pressable>
          </Swipeable>
        );
      })}
    </View>
  );
}
