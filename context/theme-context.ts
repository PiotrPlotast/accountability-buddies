import { createContext } from "react";

export type AccentId = "neon" | "blue" | "purple" | "orange" | "pink" | "teal";

export type Accent = {
  id: AccentId;
  hex: string;
  dim: string;
  shades: [string, string, string, string];
};

export type ThemeContextValue = {
  accentId: AccentId;
  accent: Accent;
  setAccent: (id: AccentId) => void;
  palette: Accent[];
  // Per-device, exactly like the accent — the same phone, not the same
  // account. `lib/haptics.ts` holds the copy that call sites actually read;
  // this one exists so the settings row has something to render.
  hapticsEnabled: boolean;
  setHapticsEnabled: (on: boolean) => void;
  // False until the stored preferences have been read back from AsyncStorage.
  hydrated: boolean;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
