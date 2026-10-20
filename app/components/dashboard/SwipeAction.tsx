import { Pressable, Text } from "react-native";
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

const ACTION_WIDTH = 72;
const ACTION_GAP = 8;

// Delete warns, edit is a caution, and a buddy's nudge or cheer takes the
// accent rather than a warning colour: it is encouragement, not a hazard.
const TONES = {
  // The page colour on the red: 4.7:1 in dark mode (light text was 3.4:1 at
  // 10px), 4.6:1 in light, where `bg` is near-white and the red is darker.
  danger: { tile: "bg-danger", label: "text-bg" },
  warning: { tile: "bg-warning", label: "text-bg" },
  accent: { tile: "", label: "text-bg" },
} as const;

type Props = {
  drag: SharedValue<number>;
  // Which edge of the row it is revealed from.
  side: "left" | "right";
  tone: keyof typeof TONES;
  emoji: string;
  label: string;
  onPress: () => void;
};

/** One tile behind a habit row, sliding in with the swipe. */
export default function SwipeAction({
  drag,
  side,
  tone,
  emoji,
  label,
  onPress,
}: Props) {
  const { accent } = useTheme();
  const offset = ACTION_WIDTH + ACTION_GAP;
  const styleAnimation = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          side === "right" ? drag.value + offset : drag.value - offset,
      },
    ],
  }));
  const { tile, label: labelColor } = TONES[tone];

  return (
    <Reanimated.View style={styleAnimation}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          width: ACTION_WIDTH,
          [side === "right" ? "marginLeft" : "marginRight"]: ACTION_GAP,
          ...(tone === "accent" ? { backgroundColor: accent.hex } : null),
        }}
        className={`px-4 py-4 rounded-tile items-center justify-center ${tile}`}
      >
        <Text style={{ fontSize: 18 }}>{emoji}</Text>
        <Text
          className={`${labelColor} font-mono-medium uppercase text-[10px] tracking-widest mt-1`}
        >
          {label}
        </Text>
      </Pressable>
    </Reanimated.View>
  );
}
