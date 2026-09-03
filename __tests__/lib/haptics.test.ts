import * as Haptics from "expo-haptics";

import {
  celebrate,
  destructive,
  error,
  setHapticsEnabled,
  tapLight,
  toggleDone,
  toggleUndone,
} from "@/lib/haptics";

const notify = Haptics.notificationAsync as jest.Mock;
const impact = Haptics.impactAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  notify.mockImplementation(() => Promise.resolve());
  impact.mockImplementation(() => Promise.resolve());
  setHapticsEnabled(true);
});

describe("haptics vocabulary", () => {
  it("maps each name onto the expo-haptics call it stands for", () => {
    tapLight();
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);

    toggleDone();
    expect(notify).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );

    toggleUndone();
    expect(impact).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Light);

    destructive();
    expect(notify).toHaveBeenLastCalledWith(
      Haptics.NotificationFeedbackType.Warning,
    );

    error();
    expect(notify).toHaveBeenLastCalledWith(
      Haptics.NotificationFeedbackType.Error,
    );
  });

  // A missing enum member reads as `undefined` and the call still resolves, so
  // assert the values are real rather than trusting the call happened.
  it("never passes an undefined feedback type", () => {
    destructive();
    error();
    for (const call of notify.mock.calls) {
      expect(call[0]).toBeDefined();
    }
  });

  it("returns nothing, so no call site can await a buzz", () => {
    expect(toggleDone()).toBeUndefined();
    expect(tapLight()).toBeUndefined();
    expect(celebrate()).toBeUndefined();
  });
});

describe("celebrate", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("fires a short sequence of pulses rather than a single buzz", () => {
    celebrate();
    // The first pulse is immediate; the rest are queued.
    expect(notify).toHaveBeenCalledTimes(1);

    jest.runAllTimers();
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it("queues no pulses at all when haptics are off", () => {
    setHapticsEnabled(false);
    celebrate();
    jest.runAllTimers();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("the kill switch", () => {
  it("silences every function while disabled", () => {
    setHapticsEnabled(false);

    tapLight();
    toggleDone();
    toggleUndone();
    destructive();
    error();

    expect(notify).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  });

  it("starts buzzing again once re-enabled", () => {
    setHapticsEnabled(false);
    toggleDone();
    expect(notify).not.toHaveBeenCalled();

    setHapticsEnabled(true);
    toggleDone();
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("failure", () => {
  it("swallows a rejected haptic instead of surfacing it to the caller", async () => {
    notify.mockImplementation(() => Promise.reject(new Error("no engine")));
    impact.mockImplementation(() => Promise.reject(new Error("no engine")));

    expect(() => {
      toggleDone();
      tapLight();
    }).not.toThrow();

    // An unhandled rejection would fail the suite on the next tick.
    await Promise.resolve();
  });

  it("survives a synchronous throw from the native module", () => {
    notify.mockImplementation(() => {
      throw new Error("no engine");
    });
    expect(() => toggleDone()).not.toThrow();
  });
});
