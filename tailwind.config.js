/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "#0B0B0C",
        surface: "#151517",
        "surface-2": "#1E1E21",
        border: "#2A2A2E",
        neon: "#C6F94A",
        "neon-dim": "#8FB732",
        text: "#F4F4F5",
        "text-muted": "#9CA3AF",
        "text-dim": "#6B7280",
        fire: "#F97316",
        danger: "#EF4444",
        warning: "#FACC15",
        accent: "#FF5E2E",
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
