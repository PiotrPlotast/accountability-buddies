import { getTodayLocalDate } from "@/lib/date";

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
