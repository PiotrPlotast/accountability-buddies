import type { ColorScheme } from "@/lib/colors";

export type AccentId = "neon" | "blue" | "purple" | "orange" | "pink" | "teal";

export type Accent = {
  id: AccentId;
  hex: string;
  // A Switch's "on" track, under a thumb painted `hex`.
  dim: string;
  // The heatmap's steps: empty, then a little, more, all done (`hex`).
  shades: [string, string, string, string];
};

type Shade = Omit<Accent, "id">;

// The stored choice is an id, so every accent exists in both schemes. The
// dark shades are the originals, but purple, a step lighter: #B45EFF was
// 4.3:1 as text on a dark card. The light ones are Tailwind 700s (neon an
// 800, the 700 is 4.4:1 under a label on the warm page), dark enough to read
// as text and to carry a `text-bg` label; the switch track is the 300, and the
// heatmap climbs 300 → 500 → 700 off a pale empty cell, so more done always
// looks darker.
const ACCENTS: { id: AccentId; dark: Shade; light: Shade }[] = [
  {
    id: "neon",
    dark: {
      hex: "#C6F94A",
      dim: "#8FB732",
      shades: ["#1E1E21", "#3A5F10", "#6E9E22", "#C6F94A"],
    },
    light: {
      hex: "#3F6212",
      dim: "#BEF264",
      shades: ["#E8E6E2", "#BEF264", "#84CC16", "#3F6212"],
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
      hex: "#0369A1",
      dim: "#7DD3FC",
      shades: ["#E8E6E2", "#7DD3FC", "#0EA5E9", "#0369A1"],
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
      hex: "#7E22CE",
      dim: "#D8B4FE",
      shades: ["#E8E6E2", "#D8B4FE", "#A855F7", "#7E22CE"],
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
      hex: "#C2410C",
      dim: "#FDBA74",
      shades: ["#E8E6E2", "#FDBA74", "#F97316", "#C2410C"],
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
      hex: "#BE185D",
      dim: "#F9A8D4",
      shades: ["#E8E6E2", "#F9A8D4", "#EC4899", "#BE185D"],
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
      hex: "#0F766E",
      dim: "#5EEAD4",
      shades: ["#E8E6E2", "#5EEAD4", "#14B8A6", "#0F766E"],
    },
  },
];

const BY_SCHEME: Record<ColorScheme, Accent[]> = {
  dark: ACCENTS.map(({ id, dark }) => ({ id, ...dark })),
  light: ACCENTS.map(({ id, light }) => ({ id, ...light })),
};

export const accentsFor = (scheme: ColorScheme): Accent[] => BY_SCHEME[scheme];

export const isAccentId = (s: string): s is AccentId =>
  ACCENTS.some((a) => a.id === s);
