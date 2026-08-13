import { DOT_STYLES } from "@/app/components/dashboard/GoalList";
import { HistoryState } from "@/lib/goalHistory";
import { themeColors } from "@/lib/colors";

const STATES: HistoryState[] = ["done", "pending", "missed", "off"];
const ACCENT = "#C6F94A";

describe("week strip dot styles", () => {
  it("covers every history state", () => {
    STATES.forEach((state) => expect(DOT_STYLES[state]).toBeDefined());
  });

  // Regression: `off` was once painted `themeColors.surface`, the same colour
  // as the habit row behind it, so the dot for a still-due today was invisible
  // and the strip appeared to have six days instead of seven.
  it("never paints a dot the same colour as the card it sits on", () => {
    STATES.forEach((state) => {
      const { backgroundColor } = DOT_STYLES[state](ACCENT);
      expect(backgroundColor).not.toBe(themeColors.surface);
    });
  });

  it("keeps every dot visible", () => {
    STATES.forEach((state) => {
      expect(DOT_STYLES[state](ACCENT).opacity).toBeGreaterThan(0.3);
    });
  });

  it("distinguishes a still-due today from an unscheduled day", () => {
    expect(DOT_STYLES.pending(ACCENT)).not.toEqual(DOT_STYLES.off(ACCENT));
  });

  it("draws completed days in the accent at full strength", () => {
    expect(DOT_STYLES.done(ACCENT)).toEqual({
      backgroundColor: ACCENT,
      opacity: 1,
    });
  });
});
