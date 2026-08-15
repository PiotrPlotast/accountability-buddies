import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/hooks/useTheme";
import { themeColors } from "@/lib/colors";

type Props = {
  size?: number;
  stroke?: number;
  progress: number;
};

export default function ProgressRing({
  size = 56,
  stroke = 6,
  progress,
}: Props) {
  const { accent } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  const percent = Math.round(clamped * 100);

  return (
    <View
      style={{ width: size, height: size }}
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
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={accent.hex}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
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
    </View>
  );
}
