import { Text, type ViewStyle } from "react-native";
import Reanimated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useOnValueChange } from "@/hooks/useOnValueChange";
import { useTheme } from "@/hooks/useTheme";

// `rounded-tile` z tailwind.config.js. NativeWind nie obsługuje `className` na
// `Reanimated.View` (patrz komentarz przy DOT_BASE w WeekStrip.tsx), więc kafelek checkboxa
// musi brać wymiary i promień ze stylu inline.
const CHECKBOX_SIZE = 40;
const TILE_RADIUS = 14;
const CHECKBOX_BASE: ViewStyle = {
  width: CHECKBOX_SIZE,
  height: CHECKBOX_SIZE,
  borderRadius: TILE_RADIUS,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
  marginRight: 12,
};

const FILL_MS = 190;

type CheckboxProps = {
  done: boolean;
  icon: string | null;
  accentHex: string;
  reduceMotion: boolean;
};

// Najczęstszy gest w aplikacji, więc jedyny, któremu opłaca się sprężyna.
//
// Two separate channels on purpose: the colour fill runs even under Reduce
// Motion — a cross-fade is not movement, and without it the tile would snap
// between two very different colours — while the scale spring is movement and
// is the part that gets dropped.
export default function GoalCheckbox({
  done,
  icon,
  accentHex,
  reduceMotion,
}: CheckboxProps) {
  const { colors } = useTheme();
  // Both start where the goal already is: a habit ticked off hours ago must not
  // spring when you open the app or switch back to your own tab.
  const fill = useSharedValue(done ? 1 : 0);
  const scale = useSharedValue(1);

  useOnValueChange(done, (next) => {
    fill.value = withTiming(next ? 1 : 0, {
      duration: FILL_MS,
      easing: Easing.out(Easing.quad),
    });

    if (reduceMotion) return;
    // Ticking off overshoots and settles; unticking just settles back. Undoing
    // should feel like a correction, not like a second achievement.
    scale.value = next
      ? withSequence(
          withSpring(1.18, { damping: 8, stiffness: 340 }),
          withSpring(1, { damping: 12, stiffness: 260 }),
        )
      : withSpring(1, { damping: 14, stiffness: 240 });
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(
      fill.value,
      [0, 1],
      [colors.background, accentHex],
    ),
    borderColor: interpolateColor(
      fill.value,
      [0, 1],
      [colors.border, accentHex],
    ),
  }));

  return (
    <Reanimated.View style={[CHECKBOX_BASE, animatedStyle]}>
      {done ? (
        <Text className="text-bg font-mono-bold text-base">✓</Text>
      ) : icon ? (
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      ) : null}
    </Reanimated.View>
  );
}
