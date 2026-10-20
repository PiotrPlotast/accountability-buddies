import { DOT_STYLES } from "@/app/components/dashboard/WeekStrip";
import { HistoryState } from "@/lib/goalHistory";
import { ColorScheme, schemeColors } from "@/lib/colors";

const STATES: HistoryState[] = ["done", "pending", "missed", "off"];
const ACCENT = "#C6F94A";

// Each test runs against both palettes: the strip sits on a card in either.
describe.each(["dark", "light"] as ColorScheme[])(
  "week strip dot styles (%s)",
  (scheme) => {
    const themeColors = schemeColors[scheme];
    const dot = (state: HistoryState, accent: string = ACCENT) =>
      DOT_STYLES[state](accent, themeColors);

    // `ViewStyle["opacity"]` is `AnimatableNumericValue`, which covers Animated
    // nodes as well as plain numbers. These styles are always static.
    const opacityOf = (state: HistoryState): number =>
      Number(dot(state).opacity ?? 1);

    it("covers every history state", () => {
      STATES.forEach((state) => expect(DOT_STYLES[state]).toBeDefined());
    });

    // Regression: `off` was once painted `themeColors.surface`, the same colour
    // as the habit row behind it, so the dot for a still-due today was invisible
    // and the strip appeared to have six days instead of seven.
    it("leaves every dot visible against the row it sits on", () => {
      STATES.forEach((state) => {
        const { backgroundColor } = dot(state);

        expect(backgroundColor).toBeTruthy();
        expect(backgroundColor).not.toBe(themeColors.surface);
        expect(opacityOf(state)).toBeGreaterThan(0.3);
      });
    });

    it("reserves the accent fill for completed days", () => {
      expect(dot("done").backgroundColor).toBe(ACCENT);

      (["pending", "missed", "off"] as HistoryState[]).forEach((state) => {
        expect(dot(state).backgroundColor).not.toBe(ACCENT);
      });
    });

    // These styles are what a viewer with Reduce Motion on actually sees —
    // `GoalList` swaps in an accent `PendingDot` only when it may animate. So a
    // still-due today has to stand on its own here: full strength, and its own
    // colour rather than a weaker copy of any neighbour.
    it("gives the reduced-motion today its own colour at full strength", () => {
      const pending = dot("pending");

      expect(pending.backgroundColor).toBe(themeColors.textMuted);
      expect(opacityOf("pending")).toBe(1);
    });

    it("distinguishes a still-due today from a settled day", () => {
      expect(dot("pending")).not.toEqual(dot("missed"));
      expect(dot("pending")).not.toEqual(dot("off"));
    });

    it("keeps a missed day more prominent than an unscheduled one", () => {
      expect(opacityOf("missed")).toBeGreaterThan(opacityOf("off"));
    });
  },
);
