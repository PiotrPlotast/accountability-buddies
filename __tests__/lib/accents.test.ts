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

  it("keeps today's dark accents exactly as they were", () => {
    expect(accentsFor("dark")[0]).toEqual({
      id: "neon",
      hex: "#C6F94A",
      dim: "#8FB732",
      shades: ["#1E1E21", "#3A5F10", "#6E9E22", "#C6F94A"],
    });
  });

  it("gives light mode its own shade of each accent", () => {
    const dark = accentsFor("dark");
    accentsFor("light").forEach((accent, i) => {
      expect(accent.hex).not.toBe(dark[i].hex);
    });
  });
});

// The accent is a fill under `text-bg` labels (buttons, the checkbox's tick,
// the active tab), and the heatmap's steps, in the scheme it is drawn in.
describe.each(SCHEMES)("%s accents", (scheme) => {
  const c = schemeColors[scheme];

  it.each(accentsFor(scheme).map((a) => [a.id, a] as const))(
    "%s carries a text-bg label at 4.5:1",
    (_, accent) => {
      expect(contrast(c.background, accent.hex)).toBeGreaterThanOrEqual(4.5);
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
      expect(accent.shades[3]).toBe(accent.hex);
    },
  );

  // An empty day is a cell on a card; painted the card's colour it vanishes.
  it("draws an empty heatmap cell apart from the card", () => {
    accentsFor(scheme).forEach((a) => expect(a.shades[0]).not.toBe(c.surface));
  });
});

// The accent is text in places (group settings' Save, the Android time).
describe.each(SCHEMES)("%s accents as text", (scheme) => {
  const c = schemeColors[scheme];

  it.each(accentsFor(scheme).map((a) => [a.id, a] as const))(
    "%s reads at 4.5:1 on a card and on the page",
    (_, accent) => {
      expect(contrast(accent.hex, c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent.hex, c.background)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("isAccentId", () => {
  it("knows the stored ids", () => {
    expect(isAccentId("teal")).toBe(true);
    expect(isAccentId("chartreuse")).toBe(false);
  });
});
