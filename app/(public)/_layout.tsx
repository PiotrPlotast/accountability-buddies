import { Stack } from "expo-router";
import { themeColors } from "@/lib/colors";

// Each screen draws its own heading, so the native header carries only the
// back button: no title, and opaque in the screen's own colour so the content
// starts below it. A transparent large-title header painted "Sign Up" faintly
// under "Create account" and put the back button on top of the heading.
export default function PublicLayout() {
  return (
    <Stack
      initialRouteName="welcome"
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
