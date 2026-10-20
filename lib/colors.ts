// The two palettes. Tailwind's tokens (`bg`, `surface`, `text-dim` …) are CSS
// variables that `ThemeProvider` sets from one of these, so a class follows
// the scheme on its own. Wherever a colour has to be a real value instead —
// navigator options, SVG props, a Switch's track, an inline `style` — read it
// from `useTheme().colors`, never from a constant: a value captured once stays
// dark when the person switches to light.
export type ColorScheme = "light" | "dark";
export type ColorMode = ColorScheme | "system";

export type ThemeColors = {
  background: string; // bg
  surface: string; // surface
  surface2: string; // surface-2
  border: string; // border
  text: string; // text
  textMuted: string; // text-muted
  // 4.5:1 on both surface and bg: WCAG AA for normal text.
  textDim: string; // text-dim
  danger: string; // danger
  warning: string; // warning
  // Behind a dialog. Not a Tailwind token: only DialogShell paints it.
  backdrop: string;
};

const dark: ThemeColors = {
  background: "#18181B",
  surface: "#27272A",
  surface2: "#3F3F46",
  border: "#2A2A2E",
  text: "#F4F4F5",
  textMuted: "#9CA3AF",
  // 4.7:1 on surface, 5.6:1 on bg.
  textDim: "#8A919E",
  // 5.4:1 on surface; #EF4444 was 4.0:1, short of AA for "Leave group".
  danger: "#F87171",
  warning: "#FACC15",
  backdrop: "rgba(0,0,0,0.7)",
};

// Warm paper rather than a lamp: near-black on pure white (17.7:1) was tiring
// to read, so the page and cards are a warm off-white and the text charcoal,
// 13.5:1 on a card. Borders are a step darker so cards keep an edge on a page
// this close to them. Signal colours are a step darker than their dark-mode
// twins so that they still read as text, and still carry a `text-bg` label on
// a swipe tile.
const light: ThemeColors = {
  background: "#F1F0EE",
  surface: "#F9F8F6",
  // A switch's off track, a missed day's dot: has to show on a card.
  surface2: "#E2DFDA",
  border: "#D9D6D0",
  text: "#2A2A2E",
  textMuted: "#55555C",
  // 5.1:1 on surface, 4.7:1 on bg.
  textDim: "#6A6A72",
  danger: "#B91C1C",
  warning: "#92400E",
  backdrop: "rgba(0,0,0,0.4)",
};

export const schemeColors: Record<ColorScheme, ThemeColors> = { dark, light };

// The variable behind each Tailwind token in `tailwind.config.js`.
const CSS_VARIABLES: Record<Exclude<keyof ThemeColors, "backdrop">, string> = {
  background: "--color-bg",
  surface: "--color-surface",
  surface2: "--color-surface-2",
  border: "--color-border",
  text: "--color-text",
  textMuted: "--color-text-muted",
  textDim: "--color-text-dim",
  danger: "--color-danger",
  warning: "--color-warning",
};

export function cssVariables(colors: ThemeColors): Record<string, string> {
  return Object.fromEntries(
    Object.entries(CSS_VARIABLES).map(([key, name]) => [
      name,
      colors[key as keyof typeof CSS_VARIABLES],
    ]),
  );
}

export const isColorMode = (s: string): s is ColorMode =>
  s === "system" || s === "light" || s === "dark";

// `system` is whatever `useColorScheme()` says. A phone that says nothing
// (`null`, or `"unspecified"` on RN 0.82+) keeps the dark look the app has
// always had.
export function resolveColorScheme(
  mode: ColorMode,
  system: string | null | undefined,
): ColorScheme {
  if (mode !== "system") return mode;
  return system === "light" ? "light" : "dark";
}
