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
      const style = DOT_STYLES[state](ACCENT);
      const filled =
        !!style.backgroundColor &&
        style.backgroundColor !== "transparent" &&
        style.backgroundColor !== themeColors.surface;
      const outlined = !!style.borderWidth && !!style.borderColor;

      expect(filled || outlined).toBe(true);
      expect(opacityOf(state)).toBeGreaterThan(0.3);
    });
  });

  it("gives the accent to the habit's own days and grey to the settled ones", () => {
    expect(DOT_STYLES.done(ACCENT).backgroundColor).toBe(ACCENT);
    expect(DOT_STYLES.pending(ACCENT).backgroundColor).toBe(ACCENT);

    (["missed", "off"] as HistoryState[]).forEach((state) => {
      expect(DOT_STYLES[state](ACCENT).backgroundColor).not.toBe(ACCENT);
    });
  });

  it("dims a still-due today below a completed one", () => {
    expect(opacityOf("pending")).toBeLessThan(opacityOf("done"));
  });

  it("distinguishes a still-due today from an unscheduled day", () => {
    expect(DOT_STYLES.pending(ACCENT)).not.toEqual(DOT_STYLES.off(ACCENT));
  });

  it("keeps a missed day more prominent than an unscheduled one", () => {
    expect(opacityOf("missed")).toBeGreaterThan(opacityOf("off"));
  });
});
