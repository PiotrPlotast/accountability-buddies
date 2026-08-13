import {
  HISTORY_DAYS,
  getCurrentStreak,
  getGoalHistory,
} from "@/lib/goalHistory";
import { getRecentLocalDates } from "@/lib/date";
import { ALL_DAYS } from "@/lib/repeatDays";
import { Goal } from "@/types/dashboardTypes";

// Wednesday 2025-01-15, local noon so no timezone can shift the calendar day.
const WEDNESDAY = new Date(2025, 0, 15, 12, 0, 0);

const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: "g1",
  title: "Meditate",
  user_id: "u1",
  group_id: "grp1",
  icon: null,
  repeat_days: ALL_DAYS,
  completed_today: false,
  completed_dates: [],
  ...overrides,
});

describe("getGoalHistory", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(WEDNESDAY);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns one cell per history day, oldest first and ending on today", () => {
    const cells = getGoalHistory(makeGoal());
    const expected = getRecentLocalDates(HISTORY_DAYS);

    expect(cells).toHaveLength(HISTORY_DAYS);
    expect(cells.map((c) => c.date)).toEqual(expected);
    expect(cells[cells.length - 1].date).toBe("2025-01-15");
  });

  it("marks logged days done and unlogged scheduled days missed", () => {
    const cells = getGoalHistory(
      makeGoal({ completed_dates: ["2025-01-13", "2025-01-14"] }),
    );
    const byDate = Object.fromEntries(cells.map((c) => [c.date, c.state]));

    expect(byDate["2025-01-13"]).toBe("done");
    expect(byDate["2025-01-14"]).toBe("done");
    expect(byDate["2025-01-12"]).toBe("missed");
  });

  it("never marks today as missed — the day is not over", () => {
    const cells = getGoalHistory(makeGoal());
    expect(cells[cells.length - 1].state).toBe("off");
  });

  it("marks unscheduled weekdays off rather than missed", () => {
    // Mon = 0 ... Sun = 6. Weekdays only, so Sat 01-11 and Sun 01-12 are off.
    const cells = getGoalHistory(makeGoal({ repeat_days: [0, 1, 2, 3, 4] }));
    const byDate = Object.fromEntries(cells.map((c) => [c.date, c.state]));

    expect(byDate["2025-01-11"]).toBe("off"); // Saturday
    expect(byDate["2025-01-12"]).toBe("off"); // Sunday
    expect(byDate["2025-01-13"]).toBe("missed"); // Monday, scheduled, no log
  });

  it("treats an absent completed_dates as no history", () => {
    const { completed_dates: _omitted, ...goal } = makeGoal();
    const cells = getGoalHistory(goal as Goal);
    expect(cells.every((c) => c.state !== "done")).toBe(true);
  });
});

describe("getCurrentStreak", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(WEDNESDAY);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("counts back from today across consecutive done days", () => {
    const goal = makeGoal({
      completed_dates: ["2025-01-13", "2025-01-14", "2025-01-15"],
      completed_today: true,
    });
    expect(getCurrentStreak(goal)).toBe(3);
  });

  it("stops at a missed day", () => {
    const goal = makeGoal({
      completed_dates: ["2025-01-11", "2025-01-14", "2025-01-15"],
      completed_today: true,
    });
    expect(getCurrentStreak(goal)).toBe(2);
  });

  it("survives an unscheduled gap without breaking", () => {
    // Weekdays only: the weekend is `off`, so Fri 01-10 still chains to Mon.
    const goal = makeGoal({
      repeat_days: [0, 1, 2, 3, 4],
      completed_dates: ["2025-01-10", "2025-01-13", "2025-01-14", "2025-01-15"],
      completed_today: true,
    });
    expect(getCurrentStreak(goal)).toBe(4);
  });

  it("is zero when today is not done and yesterday was missed", () => {
    expect(getCurrentStreak(makeGoal())).toBe(0);
  });
});
