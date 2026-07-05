/* eslint-disable no-undef */
// Test setup: register mocks for native modules and route helpers that
// don't work under jest-expo's jsdom-like environment.

require("react-native-gesture-handler/jestSetup");

// Reanimated 4 ships its own jest helper.
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// Silence "useNativeDriver" warning emitted by Animated under Jest.
jest.mock("react-native/Libraries/Animated/NativeAnimatedHelper", () => ({}), {
  virtual: true,
});

// expo-haptics — no-op in tests.
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success" },
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

// expo-clipboard
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
  getStringAsync: jest.fn(() => Promise.resolve("")),
}));

// expo-router — minimal stand-in for the bits the app uses.
jest.mock("expo-router", () => {
  const React = require("react");
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
  };
  const Stack = ({ children }) => React.createElement(React.Fragment, null, children);
  Stack.Screen = () => null;
  Stack.Protected = ({ children }) =>
    React.createElement(React.Fragment, null, children);
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    useSegments: () => [],
    usePathname: () => "/",
    Link: ({ children }) => React.createElement(React.Fragment, null, children),
    Stack,
    Redirect: () => null,
    __router: router,
  };
});

// Make `process.env.EXPO_PUBLIC_*` available so the supabase provider can build a client.
process.env.EXPO_PUBLIC_SUPABASE_URL = "http://localhost";
process.env.EXPO_PUBLIC_SUPABASE_KEY = "test-anon-key";

// Replace the real useSupabase with a synchronous version that reads the
// fake supabase client (and its attached `__testSession`) directly from
// SupabaseContext. This skips the async getSession/onAuthStateChange dance
// that otherwise leaves session=null on the first render of every test.
jest.mock("@/hooks/useSupabase", () => {
  const { useContext } = require("react");
  const { SupabaseContext } = require("@/context/supabase-context");
  return {
    useSupabase: () => {
      const supabase = useContext(SupabaseContext);
      if (!supabase) {
        throw new Error("useSupabase must be used within a SupabaseProvider");
      }
      const session = supabase.__testSession ?? null;
      return {
        isLoaded: true,
        session,
        supabase,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      };
    },
  };
});

// Silence noisy console.error in tests for expected mutation rejections.
const realError = console.error;
jest.spyOn(console, "error").mockImplementation((...args) => {
  const msg = String(args[0] || "");
  if (msg.includes("act(")) return;
  realError(...args);
});
