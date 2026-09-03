import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Reanimated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { useOnValueChange } from "@/hooks/useOnValueChange";
import { themeColors } from "@/lib/colors";

const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);

// Tyle, ile trwa zauważenie, że pierścień się ruszył — dłużej i ticknięcie
// zaczyna się wlec za palcem.
const SWEEP_MS = 420;
const PULSE_SCALE = 1.14;

type Props = {
  size?: number;
  stroke?: number;
  progress: number;
  // Bumped by `useDayCompleteSignal()` when a tap finishes the day. A counter,
  // not a boolean: two celebrations in a row have to be distinguishable. The
  // ring never decides this for itself — `progress === 1` is also true after a
  // refetch or a tab switch, and neither of those is something to celebrate.
  pulseKey?: number;
};

export default function ProgressRing({
  size = 56,
  stroke = 6,
  progress,
  pulseKey = 0,
}: Props) {
  const { accent } = useTheme();
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  const percent = Math.round(clamped * 100);

  // Starts settled at the real value — opening the dashboard is not an event,
  // so the ring is simply already there.
  const dashOffset = useSharedValue(offset);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useOnValueChange(offset, (next) => {
    dashOffset.value = reduceMotion
      ? next
      : withTiming(next, {
          duration: SWEEP_MS,
          easing: Easing.out(Easing.cubic),
        });
  });

  useOnValueChange(pulseKey, () => {
    if (reduceMotion) {
      // Reduce Motion means no movement, not no feedback: mark the moment with
      // opacity, which is not motion.
      opacity.value = withSequence(
        withTiming(0.4, { duration: 140 }),
        withTiming(1, { duration: 240 }),
      );
      return;
    }
    scale.value = withSequence(
      withSpring(PULSE_SCALE, { damping: 8, stiffness: 340 }),
      withSpring(1, { damping: 11, stiffness: 260 }),
    );
  });

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Reanimated.View
      style={[{ width: size, height: size }, pulseStyle]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Today's progress"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={themeColors.border}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={accent.hex}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          className="text-text font-mono-medium"
          style={{ fontSize: size * 0.22 }}
        >
          {percent}%
        </Text>
      </View>
    </Reanimated.View>
  );
}
