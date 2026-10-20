import type { ThemeContextValue } from "@/context/theme-context";
import { accentsFor } from "@/lib/accents";
import { ColorScheme, schemeColors } from "@/lib/colors";

// What `jest.setup.js`'s `useTheme` stub hands out. Dark unless a test asks
// for light with `setStubScheme`, and puts it back in its own `afterEach`.
let stubScheme: ColorScheme = "dark";

export function setStubScheme(scheme: ColorScheme) {
  stubScheme = scheme;
}

export function stubTheme(
  overrides: Partial<ThemeContextValue> = {},
): ThemeContextValue {
  const scheme = overrides.scheme ?? stubScheme;
  const accent = accentsFor(scheme)[0];
  return {
    accentId: accent.id,
    accent,
    setAccent: jest.fn(),
    palette: [accent],
    // The real kill switch lives in `lib/haptics`; this is only what a
    // settings row would render. Tests that care about silencing haptics
    // call `setHapticsEnabled` from that module directly.
    hapticsEnabled: true,
    setHapticsEnabled: jest.fn(),
    colorMode: "system",
    setColorMode: jest.fn(),
    scheme,
    colors: schemeColors[scheme],
    // Tests never wait on AsyncStorage, so the preferences are always settled.
    hydrated: true,
    ...overrides,
  };
}
