import "../../../global.css";
import { View } from "react-native";
import Dashboard from "@/app/components/dashboard/Dashboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { themeColors } from "@/lib/colors";
export default function Page() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: themeColors.background,
        paddingTop: insets.top,
      }}
    >
      <Dashboard />
    </View>
  );
}
