import "../../../global.css";
import { View } from "react-native";
import Profile from "@/app/components/profile/Profile";
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
      <Profile />
    </View>
  );
}
