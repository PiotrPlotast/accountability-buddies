import { isDayComplete } from "@/lib/isDayComplete";
import { getTodayDayIndex } from "@/lib/repeatDays";
import { Goal } from "@/types/dashboardTypes";

const today = getTodayDayIndex();
// Yesterday on the stored Monday = 0 scale, so it is never today.
const notToday = (today + 1) % 7;

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g-1",
  title: "Run",
  user_id: "user-1",
  group_id: "group-1",
  completed_today: false,
  icon: null,
  repeat_days: [today],
  ...over,
});

describe("isDayComplete", () => {
  it("is true when every goal scheduled for today is done", () => {
    expect(
      isDayComplete([
        goal({ id: "a", completed_today: true }),
        goal({ id: "b", completed_today: true }),
      ]),
    ).toBe(true);
  });

  it("is false while one scheduled goal is outstanding", () => {
    expect(
      isDayComplete([
        goal({ id: "a", completed_today: true }),
        goal({ id: "b", completed_today: false }),
      ]),
    ).toBe(false);
  });

  it("ignores goals that are not scheduled for today", () => {
    expect(
      isDayComplete([
        goal({ id: "a", completed_today: true }),
        goal({ id: "b", completed_today: false, repeat_days: [notToday] }),
      ]),
    ).toBe(true);
  });

  it("treats an empty repeat_days as due every day", () => {
    expect(
      isDayComplete([goal({ repeat_days: [], completed_today: false })]),
    ).toBe(false);
    expect(
      isDayComplete([goal({ repeat_days: [], completed_today: true })]),
    ).toBe(true);
  });

  // A day with nothing due was never closed out — a user with no habits at all
  // should not be congratulated for existing.
  it("is false when nothing is scheduled for today", () => {
    expect(isDayComplete([])).toBe(false);
    expect(isDayComplete([goal({ repeat_days: [notToday] })])).toBe(false);
  });
});
