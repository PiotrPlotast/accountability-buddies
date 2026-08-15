import {
  DAY_LABELS,
  DAY_NAMES,
  filterGoalsForToday,
  formatRepeatDays,
  getTodayDayIndex,
  isScheduledOn,
  toRepeatDayIndex,
} from "@/lib/repeatDays";

describe("toRepeatDayIndex", () => {
  it("shifts JS getDay() (Sunday=0) onto the stored Monday=0 scale", () => {
    // [Sun, Mon, Tue, Wed, Thu, Fri, Sat] -> [6, 0, 1, 2, 3, 4, 5]
    expect([0, 1, 2, 3, 4, 5, 6].map(toRepeatDayIndex)).toEqual([
      6, 0, 1, 2, 3, 4, 5,
    ]);
  });
});

describe("getTodayDayIndex", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 6 on a Sunday", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 9, 12)); // Sun 9 Aug 2026
    expect(getTodayDayIndex()).toBe(6);
  });

  it("returns 0 on a Monday", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 10, 12)); // Mon 10 Aug 2026
    expect(getTodayDayIndex()).toBe(0);
  });
});

describe("isScheduledOn", () => {
  it("treats empty or missing repeat_days as every day", () => {
    expect(isScheduledOn({ repeat_days: [] }, 3)).toBe(true);
    expect(isScheduledOn({ repeat_days: null }, 3)).toBe(true);
    expect(isScheduledOn({}, 3)).toBe(true);
  });

  it("matches only the listed days", () => {
    const weekdays = { repeat_days: [0, 1, 2, 3, 4] };
    expect(isScheduledOn(weekdays, 0)).toBe(true);
    expect(isScheduledOn(weekdays, 4)).toBe(true);
    expect(isScheduledOn(weekdays, 5)).toBe(false);
    expect(isScheduledOn(weekdays, 6)).toBe(false);
  });
});

describe("filterGoalsForToday", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps the weekday habit on a Friday and drops it on a Saturday", () => {
    const goals = [
      { id: "weekdays", repeat_days: [0, 1, 2, 3, 4] },
      { id: "weekend", repeat_days: [5, 6] },
      { id: "daily", repeat_days: [] },
    ];

    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 14, 12)); // Fri
    expect(filterGoalsForToday(goals).map((g) => g.id)).toEqual([
      "weekdays",
      "daily",
    ]);

    jest.setSystemTime(new Date(2026, 7, 15, 12)); // Sat
    expect(filterGoalsForToday(goals).map((g) => g.id)).toEqual([
      "weekend",
      "daily",
    ]);
  });

  it("keeps a Sunday habit on Sunday (the index that used to wrap wrong)", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 9, 12)); // Sun
    const goals = [{ id: "sunday", repeat_days: [6] }];
    expect(filterGoalsForToday(goals).map((g) => g.id)).toEqual(["sunday"]);
  });
});

describe("formatRepeatDays", () => {
  it("collapses a full or empty week to 'Every day'", () => {
    expect(formatRepeatDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(formatRepeatDays([])).toBe("Every day");
    expect(formatRepeatDays(null)).toBe("Every day");
  });

  it("names the days on the stored Monday=0 scale", () => {
    expect(formatRepeatDays([0])).toBe("Mon");
    expect(formatRepeatDays([6])).toBe("Sun");
    expect(formatRepeatDays([4, 0, 2])).toBe("Mon, Wed, Fri");
  });

  it("names the two common selections instead of listing them", () => {
    expect(formatRepeatDays([0, 1, 2, 3, 4])).toBe("Weekdays");
    expect(formatRepeatDays([5, 6])).toBe("Weekends");
  });

  it("recognises those selections whatever order they arrive in", () => {
    expect(formatRepeatDays([4, 2, 0, 3, 1])).toBe("Weekdays");
    expect(formatRepeatDays([6, 5])).toBe("Weekends");
  });

  it("still lists a selection that only overlaps a named one", () => {
    expect(formatRepeatDays([0, 1, 2, 3])).toBe("Mon, Tue, Wed, Thu");
    expect(formatRepeatDays([0, 1, 2, 3, 4, 5])).toBe(
      "Mon, Tue, Wed, Thu, Fri, Sat",
    );
    expect(formatRepeatDays([5])).toBe("Sat");
  });

  it("skips out-of-range indexes instead of rendering undefined", () => {
    expect(formatRepeatDays([0, 9])).toBe("Mon");
  });
});

describe("day label constants", () => {
  it("line up with each other, Monday first", () => {
    expect(DAY_LABELS).toHaveLength(7);
    expect(DAY_NAMES).toHaveLength(7);
    expect(DAY_NAMES[0]).toBe("Mon");
    expect(DAY_NAMES.map((n) => n[0])).toEqual(DAY_LABELS);
  });
});
