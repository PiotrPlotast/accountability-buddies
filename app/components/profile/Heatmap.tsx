import { useMemo } from "react";
import { View, ActivityIndicator } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { useHeatmapData } from "@/hooks/useHeatmapData";
import { getRecentLocalDates } from "@/lib/date";

const WEEKS = 12;
const DAYS = 7;
const TOTAL_CELLS = WEEKS * DAYS;

type Props = {
  userId?: string;
};

export default function Heatmap({ userId }: Props) {
  const { accent } = useTheme();
  const SHADES = accent.shades;

  // Zaciągamy dane z naszego nowego hooka
  const { data: heatmapDict = {}, isLoading } = useHeatmapData(userId);

  // Dates for the whole grid, oldest first — ta sama kolejność co week strip.
  // Liczone raz zamiast 84 razy przy każdym renderze.
  const dates = useMemo(() => getRecentLocalDates(TOTAL_CELLS), []);

  // A screen reader stepping through 84 unlabelled cells is useless, so the
  // grid is announced as a single summary instead. `activeDays` counts the
  // days with at least one check-in; `total` is every check-in in the window.
  const summary = useMemo(() => {
    const counts = dates.map((d) => heatmapDict[d] || 0);
    const activeDays = counts.filter((c) => c > 0).length;
    const total = counts.reduce((sum, c) => sum + c, 0);
    return `Activity over the last ${WEEKS} weeks: ${total} check-ins across ${activeDays} of ${TOTAL_CELLS} days.`;
  }, [dates, heatmapDict]);

  // Zabezpieczenie UX, dopóki baza nie odpowie
  if (isLoading) {
    return (
      <View
        style={{ height: 120, justifyContent: "center", alignItems: "center" }}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading activity"
      >
        <ActivityIndicator color={accent.hex} />
      </View>
    );
  }

  return (
    <View
      style={{ gap: 4 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
    >
      {Array.from({ length: DAYS }).map((_, row) => (
        <View key={row} style={{ flexDirection: "row", gap: 4 }}>
          {Array.from({ length: WEEKS }).map((__, col) => {
            // MAGIA SIATKI (Column-Major Order): kolumna to tydzień, więc
            // prawy dolny róg (col = 11, row = 6) -> cellIndex = 83, czyli
            // ostatni element `dates` — dzisiaj.
            const cellIndex = col * DAYS + row;

            const dateStr = dates[cellIndex];

            // Odczytujemy ze słownika ile nawyków zrobiono danego dnia (O(1))
            const count = heatmapDict[dateStr] || 0;

            // Skala intensywności: 0 = brak, 1 = jeden, 2 = dwa, 3 = trzy lub więcej
            const level = Math.min(count, 3);

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
