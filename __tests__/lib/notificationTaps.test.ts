import { claimTap, emitShowTab, onShowTab } from "@/lib/notificationTaps";

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

describe("show-tab signal", () => {
  it("tells every listener which tab, and stops after unsubscribing", () => {
    const first = jest.fn();
    const second = jest.fn();
    const offFirst = onShowTab(first);
    const offSecond = onShowTab(second);

    emitShowTab(null);
    expect(first).toHaveBeenCalledWith(null);
    expect(second).toHaveBeenCalledWith(null);

    offFirst();
    emitShowTab("user-2");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith("user-2");
    offSecond();
  });

  it("does nothing with nobody listening", () => {
    expect(() => emitShowTab(null)).not.toThrow();
  });
});
