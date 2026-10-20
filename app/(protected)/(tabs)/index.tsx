import "../../../global.css";
import { View } from "react-native";
import Dashboard from "@/app/components/dashboard/Dashboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
export default function Page() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
      }}
    >
      <Dashboard />
    </View>
  );
}
