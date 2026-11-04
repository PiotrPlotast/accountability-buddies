import { Stack } from "expo-router";
import { themeColors } from "@/lib/colors";

// The stack opens on welcome. Said here rather than as a `Stack` prop, which
// expo-router 58 (SDK 58) no longer accepts.
export const unstable_settings = { initialRouteName: "welcome" };

// Each screen draws its own heading, so the native header carries only the
// back button: no title, and opaque in the screen's own colour so the content
// starts below it. A transparent large-title header painted "Sign Up" faintly
// under "Create account" and put the back button on top of the heading.
export default function PublicLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: "",
        headerBackButtonDisplayMode: "minimal",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: themeColors.background },
        headerTintColor: themeColors.text,
        contentStyle: { backgroundColor: themeColors.background },
      }}
    >
      <Stack.Screen
        name="welcome"
        options={{ title: "Welcome", headerShown: false }}
      />
      <Stack.Screen name="sign-up" options={{ title: "Sign Up" }} />
      <Stack.Screen name="sign-in" options={{ title: "Sign In" }} />
    </Stack>
  );
}
