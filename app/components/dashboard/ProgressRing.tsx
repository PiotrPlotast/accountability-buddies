import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

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
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#2A2A2E"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#C6F94A"
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
          {Math.round(clamped * 100)}%
        </Text>
      </View>
    </View>
  );
}
