import "../../../global.css";
import { View } from "react-native";
import Dashboard from "@/app/components/dashboard/Dashboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Page() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0B0B0C",
        paddingTop: insets.top,
      }}
    >
      <Dashboard />
    </View>
  );
}
