/* eslint-disable no-undef */
// Test setup: register mocks for native modules and route helpers that
// don't work under jest-expo's jsdom-like environment.

require("react-native-gesture-handler/jestSetup");

// Reanimated 4 ships its own jest helper, but it leaves `useReducedMotion` out
// ("ADD ME IF NEEDED" in its source). Components that degrade for Reduce Motion
// would throw without it. Default to false — the ordinary path is what tests
// assert; a test wanting the degraded path spies on this export.
jest.mock("react-native-reanimated", () => ({
  ...require("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

// Silence "useNativeDriver" warning emitted by Animated under Jest.
jest.mock("react-native/Libraries/Animated/NativeAnimatedHelper", () => ({}), {
  virtual: true,
});

// Replace useTheme with a static accent. The real ThemeProvider hydrates from
// AsyncStorage on mount, which every themed component would otherwise have to
// wait on; tests care about behaviour, not which accent is selected.
jest.mock("@/hooks/useTheme", () => {
  const accent = {
    id: "neon",
    hex: "#C6F94A",
    dim: "#8FB732",
    shades: ["#1E1E21", "#3A5F10", "#6E9E22", "#C6F94A"],
  };
  return {
    useTheme: () => ({
      accentId: accent.id,
      accent,
      setAccent: jest.fn(),
      palette: [accent],
      // The real kill switch lives in `lib/haptics`; this is only what a
      // settings row would render. Tests that care about silencing haptics
      // call `setHapticsEnabled` from that module directly.
      hapticsEnabled: true,
      setHapticsEnabled: jest.fn(),
      // Tests never wait on AsyncStorage, so the preferences are always settled.
      hydrated: true,
    }),
  };
});

// Safe-area insets — the library ships a jest mock with fixed metrics, so
// screens and modals calling useSafeAreaInsets render without a provider.
jest.mock(
  "react-native-safe-area-context",
  () =>
    // The shipped mock is a default export.
    require("react-native-safe-area-context/jest/mock").default,
);

// expo-haptics — no-op in tests. The feedback-type enums have to be complete:
// a missing member reads as `undefined` and the call still "succeeds", so a
// half-filled mock hides exactly the bug it should catch.
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  selectionAsync: jest.fn(() => Promise.resolve()),
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
  const Stack = ({ children }) =>
    React.createElement(React.Fragment, null, children);
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

// `useSupabase` is deliberately NOT mocked. It is a plain `useContext` read of
// SupabaseContext, which `buildWrapper` in __tests__/test-utils/render.tsx
// fills synchronously — so tests exercise the real hook. The stub that used to
// live here existed only because the hook owned the async
// getSession/onAuthStateChange dance itself; the provider owns that now.

// Silence noisy console.error in tests for expected mutation rejections.
const realError = console.error;
jest.spyOn(console, "error").mockImplementation((...args) => {
  const msg = String(args[0] || "");
  if (msg.includes("act(")) return;
  realError(...args);
});
