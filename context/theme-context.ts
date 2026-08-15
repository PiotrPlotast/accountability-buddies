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
  // False until the stored accent has been read back from AsyncStorage.
  hydrated: boolean;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
