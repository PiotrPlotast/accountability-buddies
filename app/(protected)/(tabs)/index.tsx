import "../../../global.css";
import { View } from "react-native";
import Dashboard from "@/app/components/dashboard/Dashboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StrictMode } from "react";

export default function Page() {
  const insets = useSafeAreaInsets();

  return (
    <StrictMode>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <Dashboard />
      </View>
    </StrictMode>
  );
}
