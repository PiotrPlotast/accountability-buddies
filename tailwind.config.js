/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Set per scheme by `ThemeProvider` from `lib/colors.ts`, which owns
        // the values. A token added here needs its variable added there.
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        border: "var(--color-border)",
        text: "var(--color-text)",
        "text-muted": "var(--color-text-muted)",
        "text-dim": "var(--color-text-dim)",
        fire: "#F97316",
        danger: "var(--color-danger)",
        warning: "var(--color-warning)",
        "on-accent": "var(--color-on-accent)",
        // No accent token here on purpose: the accent is runtime state chosen
        // by the user, so it arrives through `useTheme()` as an inline style.
      },
      fontFamily: {
        mono: ["GeistMono_400Regular"],
        "mono-medium": ["GeistMono_500Medium"],
        "mono-bold": ["GeistMono_700Bold"],
      },
      borderRadius: {
        tile: "14px",
        pill: "9999px",
      },
    },
  },
  plugins: [],
};
