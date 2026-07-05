import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";

const WEEKS = 13;
const DAYS = 7;

function intensityFor(index: number, seed: number): number {
  const v = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  const frac = v - Math.floor(v);
  if (frac < 0.45) return 0;
  if (frac < 0.65) return 1;
  if (frac < 0.85) return 2;
  return 3;
}

type Props = {
  seed?: number;
};

export default function Heatmap({ seed = 7 }: Props) {
  const { accent } = useTheme();
  const SHADES = accent.shades;

  return (
    <View style={{ gap: 4 }}>
      {Array.from({ length: DAYS }).map((_, row) => (
        <View key={row} style={{ flexDirection: "row", gap: 4 }}>
          {Array.from({ length: WEEKS }).map((__, col) => {
            const idx = row * WEEKS + col;
            const level = intensityFor(idx, seed);
            return (
              <View
                key={col}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  backgroundColor: SHADES[level],
                  borderRadius: 4,
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
