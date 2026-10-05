import {
  getRecentLocalDates,
  getTodayLocalDate,
  msUntilNextLocalMidnight,
} from "@/lib/date";

describe("getTodayLocalDate", () => {
  it("returns YYYY-MM-DD", () => {
    expect(getTodayLocalDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches the local calendar day, not UTC", () => {
    // Freeze a moment that lives on different calendar days in UTC vs.
    // most western timezones, then assert the helper uses the local day.
    const fixed = new Date("2025-01-15T03:30:00Z");
    jest.useFakeTimers().setSystemTime(fixed);
    try {
      const expected = fixed.toLocaleDateString("en-CA");
      expect(getTodayLocalDate()).toBe(expected);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("msUntilNextLocalMidnight", () => {
  it("counts down to the next local midnight", () => {
    const now = new Date(2026, 9, 5, 23, 59, 30);
    expect(msUntilNextLocalMidnight(now)).toBe(30_000);
  });

  it("is a full day at midnight itself, never zero", () => {
    // A zero delay would make a timer re-fire in a tight loop at midnight.
    const now = new Date(2026, 9, 6, 0, 0, 0, 0);
    const next = new Date(2026, 9, 7, 0, 0, 0, 0);
    expect(msUntilNextLocalMidnight(now)).toBe(next.getTime() - now.getTime());
  });

  it("follows the local calendar across a month boundary", () => {
    const now = new Date(2026, 9, 31, 12, 0, 0);
    const next = new Date(2026, 10, 1, 0, 0, 0, 0);
    expect(msUntilNextLocalMidnight(now)).toBe(next.getTime() - now.getTime());
  });
});

describe("getRecentLocalDates", () => {
  it("ends on the given day, oldest first", () => {
    expect(getRecentLocalDates(3, "2026-10-01")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
  });

  it("ends on today when no day is given", () => {
    const dates = getRecentLocalDates(2);
    expect(dates[1]).toBe(getTodayLocalDate());
  });
});
