import { useEffect, useRef } from "react";
import { Alert, View, Text, Pressable } from "react-native";
import { Goal } from "@/types/dashboardTypes";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  Easing,
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  cancelAnimation,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useActiveGroup } from "@/hooks/useActiveGroup";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useTheme } from "@/hooks/useTheme";
import { themeColors } from "@/lib/colors";
import { canAddPhoto, livePhoto } from "@/lib/habitPhotos";
import GoalCheckbox from "./GoalCheckbox";
import PhotoImage from "./PhotoImage";
import SwipeAction from "./SwipeAction";
import WeekStrip, { PULSE_MIN_OPACITY, PULSE_MS } from "./WeekStrip";

type Props = {
  selectedTabId: string | null;
  goals: Goal[];
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  // A buddy's tab only: the swipe that your own rows use for delete opens a
  // nudge about an unticked habit instead, and a cheer for a ticked one.
  onNudge?: (goal: Goal) => void;
  onCheer?: (goal: Goal) => void;
  // Habit photos. Signed URLs by storage path; a photo opens the viewer.
  // `onAddPhoto` offers the camera on your own ticked habits, shown disabled
  // with `photosOffline`. Left out (the tour), rows show no photos at all.
  photoUrls?: Record<string, string>;
  onOpenPhoto?: (goal: Goal) => void;
  onAddPhoto?: (goal: Goal) => void;
  photosOffline?: boolean;
  // A habit was just ticked (never on an untick), so the dashboard can offer
  // a photo of it.
  onTicked?: (goal: Goal) => void;
};

// The rows on the active group: `GoalListView` plus the reads and the toggle
// mutation behind it.
export default function GoalList({ selectedTabId, onTicked, ...rest }: Props) {
  const { loading, userId, activeGroupId } = useActiveGroup();
  const { toggleGoal } = useDashboardActions(activeGroupId);

  const onToggle = (goal: Goal) => {
    // The photo goes with the tick (a trigger on the server), and a photo is
    // final, so this one asks first.
    if (goal.completed_today && livePhoto(goal)) {
      Alert.alert(`Untick ${goal.title}?`, "This will delete your photo.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Untick",
          style: "destructive",
          onPress: () => toggleGoal(goal),
        },
      ]);
      return;
    }
    toggleGoal(goal);
    if (!goal.completed_today) onTicked?.(goal);
  };

  return (
    <GoalListView
      {...rest}
      loading={loading}
      canEdit={selectedTabId === userId}
      onToggle={onToggle}
    />
  );
}

type RowAction = { name: string; label: string; run: (goal: Goal) => void };

type ViewProps = Omit<Props, "selectedTabId" | "onTicked"> & {
  loading: boolean;
  // Your own tab: rows tick, and swipe to edit or delete. A buddy's rows are
  // read-only and swipe to nudge (unticked, with `onNudge`) or cheer (ticked,
  // with `onCheer`).
  canEdit: boolean;
  onToggle: (goal: Goal) => void;
};

// The habit rows with nothing behind them, so the first-run tour can drive
// them with sample habits that never reach the server.
//
// `skipEntering` keeps the first paint still: entering animations fire on
// mount, and every row mounts when the dashboard opens. The config applies only
// to what is there when it mounts, so it wraps the list for its whole life —
// skeleton and empty state included — and rows that appear afterwards (an
// optimistic insert, or the rows that land once loading ends) still fade in.
export function GoalListView(props: ViewProps) {
  return (
    <LayoutAnimationConfig skipEntering>
      <GoalListContent {...props} />
    </LayoutAnimationConfig>
  );
}

function GoalListContent({
  goals,
  loading,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
  onNudge,
  onCheer,
  photoUrls,
  onOpenPhoto,
  onAddPhoto,
  photosOffline = false,
}: ViewProps) {
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

  const isViewingMe = canEdit;

  // A swipe begins as a touch on the row, and the row's press still fires when
  // the finger lifts, so swiping to edit or delete also ticked the habit. A
  // drag that starts during the touch marks it; the next touch clears the mark.
  // One flag for the list is enough: only one row is under the finger at a time.
  const swipedDuringTouch = useRef(false);
  const markSwiped = () => {
    swipedDuringTouch.current = true;
  };

  // Only a real load. A selected member missing from a loaded list used to
  // count too, and pinned the skeleton for good once that member left;
  // Dashboard now resolves the tab against the current members instead.
  if (loading) {
    return (
      <View testID="goal-list-skeleton" style={{ gap: 12 }}>
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
        // Your own photo shows on a ticked row only (an untick takes it). A
        // buddy's shows whenever the server says it's live: their day, which
        // need not be yours, decides that.
        const photo = onOpenPhoto ? livePhoto(goal) : null;
        const shownPhoto = photo && (!isViewingMe || done) ? photo : null;
        const offerCamera =
          isViewingMe && !!onAddPhoto && !shownPhoto && canAddPhoto(goal, true);
        const buddyAction = done
          ? onCheer && { onAction: onCheer, emoji: "🎉", label: "Cheer" }
          : onNudge && { onAction: onNudge, emoji: "👋", label: "Nudge" };
        // The swipes, offered to a screen reader, which can't swipe a row:
        // VoiceOver's Actions rotor and TalkBack's actions menu. A cheer for
        // one habit has no other route.
        const rowActions: RowAction[] = isViewingMe
          ? [
              { name: "edit", label: "Edit", run: onEdit },
              { name: "delete", label: "Delete", run: onDelete },
            ]
          : buddyAction
            ? [
                {
                  name: buddyAction.label.toLowerCase(),
                  label: buddyAction.label,
                  run: buddyAction.onAction,
                },
              ]
            : [];
        return (
          <Reanimated.View
            key={goal.id}
            // Skipped on first paint by the `LayoutAnimationConfig` above.
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(140)}
            // Movement, so Reduce Motion drops it and the rows re-stack
            // instantly. The fades above are opacity and stay either way.
            layout={reduceMotion ? undefined : LinearTransition.duration(220)}
          >
            <Swipeable
              renderRightActions={
                isViewingMe
                  ? (prog, drag) => (
                      <SwipeAction
                        drag={drag}
                        side="right"
                        tone="danger"
                        emoji="🗑️"
                        label="Delete"
                        onPress={() => onDelete(goal)}
                      />
                    )
                  : buddyAction
                    ? (prog, drag, methods) => (
                        <SwipeAction
                          drag={drag}
                          side="right"
                          tone="accent"
                          emoji={buddyAction.emoji}
                          label={buddyAction.label}
                          onPress={() => {
                            // The row stays under the message box; don't
                            // leave it swiped open.
                            methods?.close();
                            buddyAction.onAction(goal);
                          }}
                        />
                      )
                    : undefined
              }
              renderLeftActions={
                isViewingMe
                  ? (prog, drag) => (
                      <SwipeAction
                        drag={drag}
                        side="left"
                        tone="warning"
                        emoji="✏️"
                        label="Edit"
                        onPress={() => onEdit(goal)}
                      />
                    )
                  : undefined
              }
              onSwipeableOpenStartDrag={markSwiped}
              onSwipeableCloseStartDrag={markSwiped}
              overshootRight={false}
              overshootLeft={false}
              friction={2}
            >
              <View
                // A ticked row is dimmed by its background, never by opacity:
                // a faded row took its text down with it, to about 1.9:1.
                // `text-dim` on `bg` is 5.6:1.
                className={`${
                  done ? "bg-bg" : "bg-surface"
                } border border-border rounded-tile flex-row items-center`}
              >
                <Pressable
                  disabled={!isViewingMe}
                  onPressIn={() => {
                    swipedDuringTouch.current = false;
                  }}
                  onPress={() => {
                    if (swipedDuringTouch.current) return;
                    onToggle(goal);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done, disabled: !isViewingMe }}
                  accessibilityLabel={goal.title}
                  accessibilityActions={rowActions.map(({ name, label }) => ({
                    name,
                    label,
                  }))}
                  onAccessibilityAction={(event) =>
                    rowActions
                      .find((a) => a.name === event.nativeEvent.actionName)
                      ?.run(goal)
                  }
                  // The row's own colour too (the wrapper's, repeated), so the
                  // checkbox element itself is dimmed by background.
                  className={`${
                    done ? "bg-bg" : "bg-surface"
                  } flex-1 rounded-tile px-4 py-4 flex-row items-center`}
                >
                  <GoalCheckbox
                    done={done}
                    icon={goal.icon}
                    accentHex={accent.hex}
                    reduceMotion={reduceMotion}
                  />

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

                  {done && !shownPhoto && !offerCamera ? (
                    <Text style={{ fontSize: 16 }}>🔥</Text>
                  ) : null}
                </Pressable>
                {/* Beside the row's Pressable, never inside it: a nested
                  button is hidden from VoiceOver by the accessible row. */}
                {shownPhoto ? (
                  <Pressable
                    onPress={() => onOpenPhoto?.(goal)}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo of ${goal.title}`}
                    className="pr-3 py-2"
                  >
                    <PhotoImage
                      path={shownPhoto.path}
                      url={photoUrls?.[shownPhoto.path]}
                      style={{ width: 44, height: 44, borderRadius: 10 }}
                    />
                  </Pressable>
                ) : offerCamera ? (
                  <Pressable
                    onPress={() => onAddPhoto?.(goal)}
                    disabled={photosOffline}
                    accessibilityRole="button"
                    accessibilityLabel={`Add a photo of ${goal.title}`}
                    accessibilityHint={
                      photosOffline ? "Needs a connection" : undefined
                    }
                    accessibilityState={{ disabled: photosOffline }}
                    style={{ opacity: photosOffline ? 0.4 : 1 }}
                    className="pr-4 pl-2 py-4"
                  >
                    <Text style={{ fontSize: 20 }}>📷</Text>
                  </Pressable>
                ) : null}
              </View>
            </Swipeable>
          </Reanimated.View>
        );
      })}
    </View>
  );
}
