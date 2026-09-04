import { act, renderHook } from "@testing-library/react-native";

import {
  emitDayComplete,
  onDayComplete,
  useDayCompleteSignal,
} from "@/lib/dayCompleteSignal";

describe("dayCompleteSignal", () => {
  it("notifies a subscriber", () => {
    const fn = jest.fn();
    const off = onDayComplete(fn);

    emitDayComplete();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("notifies every subscriber", () => {
    const a = jest.fn();
    const b = jest.fn();
    const offA = onDayComplete(a);
    const offB = onDayComplete(b);

    emitDayComplete();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  // An unmounted screen that still animates is a leak with a visible symptom.
  it("stops notifying once unsubscribed", () => {
    const fn = jest.fn();
    const off = onDayComplete(fn);
    off();

    emitDayComplete();
    expect(fn).not.toHaveBeenCalled();
  });

  it("is a no-op with nobody listening", () => {
    expect(() => emitDayComplete()).not.toThrow();
  });

  // One broken listener must not swallow the celebration for the rest.
  it("keeps going when a listener throws", () => {
    const bad = jest.fn(() => {
      throw new Error("boom");
    });
    const good = jest.fn();
    const offBad = onDayComplete(bad);
    const offGood = onDayComplete(good);

    expect(() => emitDayComplete()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
  });

  it("unsubscribes idempotently", () => {
    const fn = jest.fn();
    const off = onDayComplete(fn);
    off();
    off();

    emitDayComplete();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("useDayCompleteSignal", () => {
  it("starts at zero, so nothing animates on first paint", () => {
    const { result } = renderHook(() => useDayCompleteSignal());
    expect(result.current).toBe(0);
  });

  it("advances once per celebration", () => {
    const { result } = renderHook(() => useDayCompleteSignal());

    act(() => emitDayComplete());
    expect(result.current).toBe(1);

    act(() => emitDayComplete());
    expect(result.current).toBe(2);
  });

  it("detaches on unmount", () => {
    const { result, unmount } = renderHook(() => useDayCompleteSignal());
    act(() => emitDayComplete());
    expect(result.current).toBe(1);

    unmount();
    expect(() => emitDayComplete()).not.toThrow();
  });
});
