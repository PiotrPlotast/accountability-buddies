import {
  dateToHHMM,
  formatReminderTime,
  hhmmToDate,
  toHHMM,
} from "@/lib/reminderTime";

describe("toHHMM", () => {
  it("drops the seconds Postgres adds to a time", () => {
    expect(toHHMM("08:00:00")).toBe("08:00");
  });

  it("leaves an HH:MM value as it is", () => {
    expect(toHHMM("21:45")).toBe("21:45");
  });

  it("maps no reminder to null", () => {
    expect(toHHMM(null)).toBeNull();
    expect(toHHMM(undefined)).toBeNull();
  });
});

describe("dateToHHMM / hhmmToDate", () => {
  it("reads the local hours and minutes, zero-padded", () => {
    expect(dateToHHMM(new Date(2026, 9, 8, 7, 5))).toBe("07:05");
  });

  it("builds a local date at that time", () => {
    const d = hhmmToDate("07:05");
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(5);
  });

  it("round-trips", () => {
    expect(dateToHHMM(hhmmToDate("23:59"))).toBe("23:59");
  });
});

describe("formatReminderTime", () => {
  it("formats in the phone's own clock style", () => {
    const expected = new Date(2026, 0, 1, 8, 30).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    expect(formatReminderTime("08:30")).toBe(expected);
  });
});
