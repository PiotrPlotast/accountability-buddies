import type { ColorScheme } from "@/lib/colors";

export type AccentId = "neon" | "blue" | "purple" | "orange" | "pink" | "teal";

export type Accent = {
  id: AccentId;
  // The fill: buttons, the checkbox, the active tab, the ring, the week dots.
  // Whatever sits on it is `onAccent` (`text-on-accent`).
  hex: string;
  // The accent drawn as text, an icon, a spinner or a tint. Today the fill
  // itself in both schemes (the light fills are deep enough to read on
  // white), but kept apart so an accent that is bright on white can't be
  // used as text by accident: lightMode.test.tsx guards `color: accent.hex`.
  text: string;
  // A Switch's "on" track, under a thumb painted `hex`.
  dim: string;
  // The heatmap's steps: empty, then a little, more, all done.
  shades: [string, string, string, string];
};

type Shade = Omit<Accent, "id" | "text">;

// The stored choice is an id, so every accent exists in both schemes. Dark
// mode fills with the bright originals (purple a step lighter than it first
// was: #B45EFF was 4.3:1 as text on a dark card) under a dark label. Light
// mode fills with the deep 900 shade of the same hue (navy, forest green,
// burgundy ...) under a white label, and that deep shade is also its text
// colour; the switch track is the 300, and the heatmap climbs 200 → 500 →
// 900 off a pale empty cell, so more done always looks darker.
const ACCENTS: {
  id: AccentId;
  dark: Shade;
  light: Shade;
}[] = [
  {
    id: "neon",
    dark: {
      hex: "#C6F94A",
      dim: "#8FB732",
      shades: ["#1E1E21", "#3A5F10", "#6E9E22", "#C6F94A"],
    },
    light: {
      hex: "#14532D",
      dim: "#86EFAC",
      shades: ["#F4F4F5", "#BBF7D0", "#22C55E", "#14532D"],
    },
  },
  {
    id: "blue",
    dark: {
      hex: "#4AB8F9",
      dim: "#2E7AB7",
      shades: ["#1E1E21", "#103040", "#1F6F9E", "#4AB8F9"],
    },
    light: {
      hex: "#172554",
      dim: "#93C5FD",
      shades: ["#F4F4F5", "#BFDBFE", "#3B82F6", "#172554"],
    },
  },
  {
    id: "purple",
    dark: {
      hex: "#C084FC",
      dim: "#7E3FB3",
      shades: ["#1E1E21", "#3A1F4F", "#7E3FB3", "#C084FC"],
    },
    light: {
      hex: "#581C87",
      dim: "#D8B4FE",
      shades: ["#F4F4F5", "#E9D5FF", "#A855F7", "#581C87"],
    },
  },
  {
    id: "orange",
    dark: {
      hex: "#FF8A3D",
      dim: "#B85F25",
      shades: ["#1E1E21", "#4F2A11", "#B85F25", "#FF8A3D"],
    },
    light: {
      hex: "#7C2D12",
      dim: "#FDBA74",
      shades: ["#F4F4F5", "#FED7AA", "#F97316", "#7C2D12"],
    },
  },
  {
    id: "pink",
    dark: {
      hex: "#FF5E9C",
      dim: "#B73F70",
      shades: ["#1E1E21", "#4F1E33", "#B73F70", "#FF5E9C"],
    },
    light: {
      hex: "#831843",
      dim: "#F9A8D4",
      shades: ["#F4F4F5", "#FBCFE8", "#EC4899", "#831843"],
    },
  },
  {
    id: "teal",
    dark: {
      hex: "#3DD9C5",
      dim: "#1F8E80",
      shades: ["#1E1E21", "#103E38", "#1F8E80", "#3DD9C5"],
    },
    light: {
      hex: "#134E4A",
      dim: "#5EEAD4",
      shades: ["#F4F4F5", "#99F6E4", "#14B8A6", "#134E4A"],
    },
  },
];

const BY_SCHEME: Record<ColorScheme, Accent[]> = {
  dark: ACCENTS.map(({ id, dark }) => ({ id, ...dark, text: dark.hex })),
  light: ACCENTS.map(({ id, light }) => ({ id, ...light, text: light.hex })),
};

export const accentsFor = (scheme: ColorScheme): Accent[] => BY_SCHEME[scheme];

export const isAccentId = (s: string): s is AccentId =>
  ACCENTS.some((a) => a.id === s);
