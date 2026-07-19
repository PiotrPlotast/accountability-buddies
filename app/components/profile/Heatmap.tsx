import { View, ActivityIndicator } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { useHeatmapData } from "@/hooks/useHeatmapData";

const WEEKS = 12;
const DAYS = 7;

type Props = {
  userId?: string;
};

export default function Heatmap({ userId }: Props) {
  const { accent } = useTheme();
  const SHADES = accent.shades;

  // Zaciągamy dane z naszego nowego hooka
  const { data: heatmapDict = {}, isLoading } = useHeatmapData(userId);

  // Pomocnicza funkcja: oblicza datę X dni temu i zwraca format "YYYY-MM-DD"
  const getDateStringDaysAgo = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    // Locale "en-CA" sprytnie wymusza format YYYY-MM-DD bez względu na ustawienia telefonu
    return d.toLocaleDateString("en-CA");
  };

  // Zabezpieczenie UX, dopóki baza nie odpowie
  if (isLoading) {
    return (
      <View
        style={{ height: 120, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator color={accent.hex} />
      </View>
    );
  }

  return (
    <View style={{ gap: 4 }}>
      {Array.from({ length: DAYS }).map((_, row) => (
        <View key={row} style={{ flexDirection: "row", gap: 4 }}>
          {Array.from({ length: WEEKS }).map((__, col) => {
            // MAGIA SIATKI (Column-Major Order):
            // Kiedy col = 11 i row = 6 (prawy dolny róg) -> cellIndex = 83.
            // 83 - 83 = 0 (dzisiaj)
            const cellIndex = col * DAYS + row;
            const daysAgo = WEEKS * DAYS - 1 - cellIndex; // 83 - cellIndex

            const dateStr = getDateStringDaysAgo(daysAgo);

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
