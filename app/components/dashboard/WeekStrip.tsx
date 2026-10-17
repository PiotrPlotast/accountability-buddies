import { View, type ViewStyle } from "react-native";
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { Goal } from "@/types/dashboardTypes";
import { getGoalHistory, type HistoryState } from "@/lib/goalHistory";
import { themeColors } from "@/lib/colors";

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
export const PULSE_MS = 900;
export const PULSE_MIN_OPACITY = 0.55;

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

export default function WeekStrip({
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
