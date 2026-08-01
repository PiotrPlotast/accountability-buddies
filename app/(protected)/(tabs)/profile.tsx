import "../../../global.css";
import { View } from "react-native";
import Profile from "@/app/components/profile/Profile";
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
      <Profile />
    </View>
  );
}
