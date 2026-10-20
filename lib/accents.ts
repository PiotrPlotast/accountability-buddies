import type { ColorScheme } from "@/lib/colors";

export type AccentId = "neon" | "blue" | "purple" | "orange" | "pink" | "teal";

export type Accent = {
  id: AccentId;
  // The fill: buttons, the checkbox, the active tab, the ring, the week dots.
  // Whatever sits on it is `onAccent` (`text-on-accent`).
  hex: string;
  // The accent drawn as text, an icon, a spinner or a tint. The fill itself in
  // dark mode; a darker shade in light mode, where the bright fill is
  // unreadable on white.
  text: string;
  // A Switch's "on" track, under a thumb painted `hex`.
  dim: string;
  // The heatmap's steps: empty, then a little, more, all done.
  shades: [string, string, string, string];
};

type Fill = Pick<Accent, "hex" | "dim">;
type Scheme = Pick<Accent, "text" | "shades">;

// The stored choice is an id, so every accent exists in both schemes, and it
// fills with the same bright colour in both: it is the app's identity. Purple
// is a step lighter than it first was, since #B45EFF was 4.3:1 as text on a
// dark card. In light mode only the text shade changes, a Tailwind 700 that
// reads on white, and the heatmap climbs 200 → 400 → 600 off a pale empty
// cell, so more done always looks darker.
const ACCENTS: {
  id: AccentId;
  fill: Fill;
  dark: Pick<Accent, "shades">;
  light: Scheme;
}[] = [
  {
    id: "neon",
    fill: { hex: "#C6F94A", dim: "#8FB732" },
    dark: { shades: ["#1E1E21", "#3A5F10", "#6E9E22", "#C6F94A"] },
    light: {
      text: "#4D7C0F",
      shades: ["#F4F4F5", "#D9F99D", "#A3E635", "#65A30D"],
    },
  },
  {
    id: "blue",
    fill: { hex: "#4AB8F9", dim: "#2E7AB7" },
    dark: { shades: ["#1E1E21", "#103040", "#1F6F9E", "#4AB8F9"] },
    light: {
      text: "#0369A1",
      shades: ["#F4F4F5", "#BAE6FD", "#38BDF8", "#0284C7"],
    },
  },
  {
    id: "purple",
    fill: { hex: "#C084FC", dim: "#7E3FB3" },
    dark: { shades: ["#1E1E21", "#3A1F4F", "#7E3FB3", "#C084FC"] },
    light: {
      text: "#7E22CE",
      shades: ["#F4F4F5", "#E9D5FF", "#C084FC", "#9333EA"],
    },
  },
  {
    id: "orange",
    fill: { hex: "#FF8A3D", dim: "#B85F25" },
    dark: { shades: ["#1E1E21", "#4F2A11", "#B85F25", "#FF8A3D"] },
    light: {
      text: "#C2410C",
      shades: ["#F4F4F5", "#FED7AA", "#FB923C", "#EA580C"],
    },
  },
  {
    id: "pink",
    fill: { hex: "#FF5E9C", dim: "#B73F70" },
    dark: { shades: ["#1E1E21", "#4F1E33", "#B73F70", "#FF5E9C"] },
    light: {
      text: "#BE185D",
      shades: ["#F4F4F5", "#FBCFE8", "#F472B6", "#DB2777"],
    },
  },
  {
    id: "teal",
    fill: { hex: "#3DD9C5", dim: "#1F8E80" },
    dark: { shades: ["#1E1E21", "#103E38", "#1F8E80", "#3DD9C5"] },
    light: {
      text: "#0F766E",
      shades: ["#F4F4F5", "#99F6E4", "#2DD4BF", "#0D9488"],
    },
  },
];

const BY_SCHEME: Record<ColorScheme, Accent[]> = {
  dark: ACCENTS.map(({ id, fill, dark }) => ({
    id,
    hex: fill.hex,
    text: fill.hex,
    dim: fill.dim,
    ...dark,
  })),
  light: ACCENTS.map(({ id, fill, light }) => ({ id, ...fill, ...light })),
};

export const accentsFor = (scheme: ColorScheme): Accent[] => BY_SCHEME[scheme];

export const isAccentId = (s: string): s is AccentId =>
  ACCENTS.some((a) => a.id === s);
