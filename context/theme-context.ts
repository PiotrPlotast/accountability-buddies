import { createContext } from "react";

import type { Accent, AccentId } from "@/lib/accents";
import type { ColorMode, ColorScheme, ThemeColors } from "@/lib/colors";

export type { Accent, AccentId } from "@/lib/accents";

export type ThemeContextValue = {
  accentId: AccentId;
  // The chosen accent in the current scheme's shade.
  accent: Accent;
  setAccent: (id: AccentId) => void;
  palette: Accent[];
  // Per-device, exactly like the accent — the same phone, not the same
  // account. `lib/haptics.ts` holds the copy that call sites actually read;
  // this one exists so the settings row has something to render.
  hapticsEnabled: boolean;
  setHapticsEnabled: (on: boolean) => void;
  // What the person picked (per device), and what it comes to right now:
  // `system` resolves to the phone's appearance and follows it live.
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  scheme: ColorScheme;
  // The palette as real values, for props and inline styles that a class
  // can't reach. Classes follow the scheme on their own.
  colors: ThemeColors;
  // False until the stored preferences have been read back from AsyncStorage.
  hydrated: boolean;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
