import { accentsFor, isAccentId } from "@/lib/accents";
import { ColorScheme, schemeColors } from "@/lib/colors";

import { contrast, luminance } from "../test-utils/contrast";

const SCHEMES: ColorScheme[] = ["dark", "light"];

describe("accentsFor", () => {
  // The stored accent is an id; it has to mean something in either scheme.
  it("offers the same accents, in the same order, in both schemes", () => {
    expect(accentsFor("light").map((a) => a.id)).toEqual(
      accentsFor("dark").map((a) => a.id),
    );
  });

  it("keeps today's dark neon exactly as it was", () => {
    expect(accentsFor("dark")[0]).toEqual({
      id: "neon",
      hex: "#C6F94A",
      text: "#C6F94A",
      dim: "#8FB732",
      shades: ["#1E1E21", "#3A5F10", "#6E9E22", "#C6F94A"],
    });
  });

  // The accent is the app's identity: light mode fills with the same colour,
  // and only text drawn in it goes darker.
  it("fills with the same accent in light mode as in dark", () => {
    const dark = accentsFor("dark");
    accentsFor("light").forEach((accent, i) => {
      expect(accent.hex).toBe(dark[i].hex);
      expect(accent.dim).toBe(dark[i].dim);
    });
  });

  it("draws text in the fill colour itself in dark mode", () => {
    accentsFor("dark").forEach((a) => expect(a.text).toBe(a.hex));
  });
});

// The accent is a fill under `text-on-accent` labels (buttons, the checkbox's
// tick, the active tab), and the heatmap's steps, in the scheme it is drawn in.
describe.each(SCHEMES)("%s accents", (scheme) => {
  const c = schemeColors[scheme];

  it.each(accentsFor(scheme).map((a) => [a.id, a] as const))(
    "%s carries a text-on-accent label at 4.5:1",
    (_, accent) => {
      expect(contrast(c.onAccent, accent.hex)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // Group settings' Save, the welcome headline, the Android time.
  it.each(accentsFor(scheme).map((a) => [a.id, a] as const))(
    "%s reads at 4.5:1 as text on a card and on the page",
    (_, accent) => {
      expect(contrast(accent.text, c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent.text, c.background)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // The heatmap's four steps: empty, then more and more done. More has to
  // look like more, which means further from the page in either direction.
  it.each(accentsFor(scheme).map((a) => [a.id, a] as const))(
    "%s heatmap shades move steadily away from the page",
    (_, accent) => {
      const page = luminance(c.background);
      const distance = accent.shades.map((s) => Math.abs(luminance(s) - page));
      for (let i = 1; i < distance.length; i++) {
        expect(distance[i]).toBeGreaterThan(distance[i - 1]);
      }
    },
  );

  // An empty day is a cell on a card; painted the card's colour it vanishes.
  it("draws an empty heatmap cell apart from the card", () => {
    accentsFor(scheme).forEach((a) => expect(a.shades[0]).not.toBe(c.surface));
  });
});

describe("isAccentId", () => {
  it("knows the stored ids", () => {
    expect(isAccentId("teal")).toBe(true);
    expect(isAccentId("chartreuse")).toBe(false);
  });
});
