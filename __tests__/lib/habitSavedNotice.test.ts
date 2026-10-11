import {
  emitHabitSavedNotice,
  habitSavedNotice,
  onHabitSavedNotice,
} from "@/lib/habitSavedNotice";

// Day indexes on the stored Monday = 0 ... Sunday = 6 scale.
const MON = 0;
const TUE = 1;
const WED = 2;
const FRI = 4;
const SAT = 5;
const SUN = 6;
const WEEKDAYS = [0, 1, 2, 3, 4];

describe("habitSavedNotice for a new habit", () => {
  it("names the habit and its first day when it isn't due today", () => {
    expect(
      habitSavedNotice({ title: "Read", days: WEEKDAYS, today: SUN }),
    ).toBe("Read saved. First up tomorrow.");
  });

  it("names the weekday when the first day is further off", () => {
    expect(
      habitSavedNotice({ title: "Read", days: WEEKDAYS, today: SAT }),
    ).toBe("Read saved. First up Monday.");
  });

  it("wraps past Sunday to find the first day", () => {
    expect(habitSavedNotice({ title: "Gym", days: [TUE], today: FRI })).toBe(
      "Gym saved. First up Tuesday.",
    );
  });

  it("says nothing when the habit is due today", () => {
    expect(
      habitSavedNotice({ title: "Read", days: WEEKDAYS, today: MON }),
    ).toBeNull();
  });

  it("says nothing for an empty schedule, which means every day", () => {
    expect(
      habitSavedNotice({ title: "Read", days: [], today: SUN }),
    ).toBeNull();
  });
});

describe("habitSavedNotice for an edit", () => {
  it("says the habit is off today when the edit takes today away", () => {
    expect(
      habitSavedNotice({
        title: "Run",
        days: [WED],
        previousDays: [MON, WED],
        today: MON,
      }),
    ).toBe("Run is off today. Next up Wednesday.");
  });

  it("treats an empty previous schedule as every day", () => {
    expect(
      habitSavedNotice({
        title: "Run",
        days: [MON],
        previousDays: [],
        today: SUN,
      }),
    ).toBe("Run is off today. Next up tomorrow.");
  });

  // It wasn't on today's list before the edit either, so nothing vanished.
  it("says nothing when the habit was already off today", () => {
    expect(
      habitSavedNotice({
        title: "Run",
        days: [WED],
        previousDays: [WED],
        today: MON,
      }),
    ).toBeNull();
  });

  it("says nothing when the habit is still due today", () => {
    expect(
      habitSavedNotice({
        title: "Run",
        days: [MON],
        previousDays: [MON, WED],
        today: MON,
      }),
    ).toBeNull();
  });
});

describe("habit saved notice signal", () => {
  it("delivers the message to every listener until they unsubscribe", () => {
    const first = jest.fn();
    const second = jest.fn();
    const offFirst = onHabitSavedNotice(first);
    const offSecond = onHabitSavedNotice(second);

    emitHabitSavedNotice("Read saved. First up Monday.");
    offFirst();
    emitHabitSavedNotice("Run is off today. Next up tomorrow.");
    offSecond();

    expect(first.mock.calls).toEqual([["Read saved. First up Monday."]]);
    expect(second.mock.calls).toEqual([
      ["Read saved. First up Monday."],
      ["Run is off today. Next up tomorrow."],
    ]);
  });

  it("keeps delivering when one listener throws", () => {
    const broken = jest.fn(() => {
      throw new Error("boom");
    });
    const healthy = jest.fn();
    const offBroken = onHabitSavedNotice(broken);
    const offHealthy = onHabitSavedNotice(healthy);

    emitHabitSavedNotice("x");
    offBroken();
    offHealthy();

    expect(healthy).toHaveBeenCalledWith("x");
  });
});
