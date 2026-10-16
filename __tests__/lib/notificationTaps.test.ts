import {
  claimTap,
  emitShowTab,
  onCheerRequest,
  onShowTab,
  requestCheer,
} from "@/lib/notificationTaps";

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

describe("cheer request", () => {
  const request = {
    buddyId: "user-2",
    goal: { id: "goal-1", title: "Run" },
    day: "2026-10-16",
  };

  it("hands a request to the listener", () => {
    const listener = jest.fn();
    const off = onCheerRequest(listener);
    requestCheer(request);
    expect(listener).toHaveBeenCalledWith(request);
    off();
  });

  // A tap on a cold start can be routed before the dashboard has mounted.
  it("keeps a request nobody heard for the first listener, once", () => {
    requestCheer(request);
    const first = jest.fn();
    const offFirst = onCheerRequest(first);
    expect(first).toHaveBeenCalledWith(request);
    offFirst();

    const second = jest.fn();
    const offSecond = onCheerRequest(second);
    expect(second).not.toHaveBeenCalled();
    offSecond();
  });

  it("stops after unsubscribing", () => {
    const listener = jest.fn();
    onCheerRequest(listener)();
    const holder = jest.fn();
    const off = onCheerRequest(holder);
    requestCheer(request);
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});
