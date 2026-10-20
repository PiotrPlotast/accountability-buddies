import {
  ColorScheme,
  cssVariables,
  isColorMode,
  resolveColorScheme,
  schemeColors,
} from "@/lib/colors";

import { contrast } from "../test-utils/contrast";

const SCHEMES: ColorScheme[] = ["dark", "light"];

// WCAG 1.4.3: 4.5:1 for normal-size text. Every text token sits on both the
// page (`bg`) and the cards (`surface`), so it has to clear that on each.
describe.each(SCHEMES)("the %s palette", (scheme) => {
  const c = schemeColors[scheme];

  it.each([
    ["text", c.text],
    ["text-muted", c.textMuted],
    ["text-dim", c.textDim],
  ])("%s reads at 4.5:1 on bg and surface", (_, fg) => {
    expect(contrast(fg, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fg, c.surface)).toBeGreaterThanOrEqual(4.5);
  });

  // `surface-2` is the off track of a switch, a missed day's dot and the
  // tour's idle page dots, all drawn on a card.
  it("keeps surface-2 apart from the card it is drawn on", () => {
    expect(c.surface2).not.toBe(c.surface);
  });
});

// The dark palette predates these checks — its danger red is 4.0:1 on
// `surface` — so they hold the new palette to the line without moving the old.
describe("the light palette's signal colours", () => {
  const c = schemeColors.light;

  it("reads danger text at 4.5:1 on bg and surface", () => {
    expect(contrast(c.danger, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.danger, c.surface)).toBeGreaterThanOrEqual(4.5);
  });

  // Swipe tiles label themselves `text-bg` on a danger or warning fill.
  it.each([
    ["danger", c.danger],
    ["warning", c.warning],
  ])("reads a text-bg label at 4.5:1 on a %s tile", (_, fill) => {
    expect(contrast(c.background, fill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("cssVariables", () => {
  const tailwind = require("../../tailwind.config.js");
  const tokens = Object.entries(
    tailwind.theme.extend.colors as Record<string, string>,
  ).filter(([, value]) => value.startsWith("var("));
  const nameOf = (value: string) => value.slice("var(".length, -1);

  // A class whose variable is never set paints nothing — on native the
  // element simply loses its colour, with no warning anywhere.
  it.each(SCHEMES)("sets every variable a Tailwind token reads (%s)", (s) => {
    const vars = cssVariables(schemeColors[s]);
    expect(tokens.length).toBeGreaterThan(0);
    tokens.forEach(([, value]) => {
      expect(vars[nameOf(value)]).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  it("hands the token the palette's own value", () => {
    const vars = cssVariables(schemeColors.light);
    const textDim = tailwind.theme.extend.colors["text-dim"];
    expect(vars[nameOf(textDim)]).toBe(schemeColors.light.textDim);
  });

  it("themes the page, cards and text through variables", () => {
    ["bg", "surface", "surface-2", "border", "text", "text-muted", "text-dim"]
      .map((token) => tailwind.theme.extend.colors[token])
      .forEach((value) => expect(value).toMatch(/^var\(--/));
  });
});

describe("resolveColorScheme", () => {
  it.each([
    ["light", "dark", "light"],
    ["dark", "light", "dark"],
  ] as const)("an explicit %s ignores a %s system", (mode, system, out) => {
    expect(resolveColorScheme(mode, system)).toBe(out);
  });

  it.each(["light", "dark"] as const)("system follows a %s phone", (s) => {
    expect(resolveColorScheme("system", s)).toBe(s);
  });

  // The app was dark-only until now; a phone that reports nothing keeps the
  // look everyone already has.
  it.each([null, undefined, "unspecified"] as const)(
    "system falls back to dark when the phone reports %s",
    (system) => {
      expect(resolveColorScheme("system", system)).toBe("dark");
    },
  );
});

describe("isColorMode", () => {
  it.each(["system", "light", "dark"])("accepts %s", (v) => {
    expect(isColorMode(v)).toBe(true);
  });

  it.each(["auto", "", "Dark"])("rejects %j", (v) => {
    expect(isColorMode(v)).toBe(false);
  });
});
