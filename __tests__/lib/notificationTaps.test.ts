import { claimTap, emitShowMyTab, onShowMyTab } from "@/lib/notificationTaps";

describe("claimTap", () => {
  it("claims a tap the first time and refuses it after that", () => {
    expect(claimTap("tap-a")).toBe(true);
    expect(claimTap("tap-a")).toBe(false);
  });

  it("keeps different taps apart", () => {
    expect(claimTap("tap-b")).toBe(true);
    expect(claimTap("tap-c")).toBe(true);
  });
});

describe("show-my-tab signal", () => {
  it("tells every listener, and stops after unsubscribing", () => {
    const first = jest.fn();
    const second = jest.fn();
    const offFirst = onShowMyTab(first);
    const offSecond = onShowMyTab(second);

    emitShowMyTab();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    offFirst();
    emitShowMyTab();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    offSecond();
  });

  it("does nothing with nobody listening", () => {
    expect(() => emitShowMyTab()).not.toThrow();
  });
});
