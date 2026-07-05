import { useContext } from "react";

import { ThemeContext, ThemeContextValue } from "@/context/theme-context";

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
};
