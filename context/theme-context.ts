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
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
