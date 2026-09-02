import { DOT_STYLES } from "@/app/components/dashboard/GoalList";
import { HistoryState } from "@/lib/goalHistory";
import { themeColors } from "@/lib/colors";

const STATES: HistoryState[] = ["done", "pending", "missed", "off"];
const ACCENT = "#C6F94A";

// `ViewStyle["opacity"]` is `AnimatableNumericValue`, which covers Animated
// nodes as well as plain numbers. These styles are always static.
const opacityOf = (state: HistoryState): number =>
  Number(DOT_STYLES[state](ACCENT).opacity ?? 1);

describe("week strip dot styles", () => {
  it("covers every history state", () => {
    STATES.forEach((state) => expect(DOT_STYLES[state]).toBeDefined());
  });

  // Regression: `off` was once painted `themeColors.surface`, the same colour
  // as the habit row behind it, so the dot for a still-due today was invisible
  // and the strip appeared to have six days instead of seven.
  it("leaves every dot visible against the row it sits on", () => {
    STATES.forEach((state) => {
      const { backgroundColor } = DOT_STYLES[state](ACCENT);

      expect(backgroundColor).toBeTruthy();
      expect(backgroundColor).not.toBe(themeColors.surface);
      expect(opacityOf(state)).toBeGreaterThan(0.3);
    });
  });

  it("reserves the accent fill for completed days", () => {
    expect(DOT_STYLES.done(ACCENT).backgroundColor).toBe(ACCENT);

    (["pending", "missed", "off"] as HistoryState[]).forEach((state) => {
      expect(DOT_STYLES[state](ACCENT).backgroundColor).not.toBe(ACCENT);
    });
  });

  // These styles are what a viewer with Reduce Motion on actually sees —
  // `GoalList` swaps in an accent `PendingDot` only when it may animate. So a
  // still-due today has to stand on its own here: full strength, and its own
  // colour rather than a weaker copy of any neighbour.
  it("gives the reduced-motion today its own colour at full strength", () => {
    const pending = DOT_STYLES.pending(ACCENT);

    expect(pending.backgroundColor).toBe(themeColors.textMuted);
    expect(opacityOf("pending")).toBe(1);
  });

  it("distinguishes a still-due today from a settled day", () => {
    expect(DOT_STYLES.pending(ACCENT)).not.toEqual(DOT_STYLES.missed(ACCENT));
    expect(DOT_STYLES.pending(ACCENT)).not.toEqual(DOT_STYLES.off(ACCENT));
  });

  it("keeps a missed day more prominent than an unscheduled one", () => {
    expect(opacityOf("missed")).toBeGreaterThan(opacityOf("off"));
  });
});
