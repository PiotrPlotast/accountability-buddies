import { useState } from "react";
import { act, renderHook } from "@testing-library/react-native";

import { useOnValueChange } from "@/hooks/useOnValueChange";

describe("useOnValueChange", () => {
  // The whole point: an animation that replays on first paint is the bug this
  // hook exists to prevent.
  it("stays quiet on mount", () => {
    const effect = jest.fn();
    renderHook(() => useOnValueChange(1, effect));
    expect(effect).not.toHaveBeenCalled();
  });

  it("fires with the new and the previous value when it changes", () => {
    const effect = jest.fn();
    const { rerender } = renderHook<void, { value: number }>(
      ({ value }) => useOnValueChange(value, effect),
      { initialProps: { value: 1 } },
    );

    rerender({ value: 2 });
    expect(effect).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledWith(2, 1);
  });

  it("ignores a re-render that does not change the value", () => {
    const effect = jest.fn();
    const { rerender } = renderHook<void, { value: number }>(
      ({ value }) => useOnValueChange(value, effect),
      { initialProps: { value: 1 } },
    );

    rerender({ value: 1 });
    rerender({ value: 1 });
    expect(effect).not.toHaveBeenCalled();
  });

  it("keeps firing on every subsequent change", () => {
    const effect = jest.fn();
    const { rerender } = renderHook<void, { value: number }>(
      ({ value }) => useOnValueChange(value, effect),
      { initialProps: { value: 0 } },
    );

    rerender({ value: 1 });
    rerender({ value: 2 });
    rerender({ value: 3 });
    expect(effect).toHaveBeenCalledTimes(3);
    expect(effect).toHaveBeenLastCalledWith(3, 2);
  });

  it("works for booleans, including the flip back", () => {
    const effect = jest.fn();
    const { rerender } = renderHook<void, { value: boolean }>(
      ({ value }) => useOnValueChange(value, effect),
      { initialProps: { value: false } },
    );

    rerender({ value: true });
    rerender({ value: false });
    expect(effect).toHaveBeenCalledTimes(2);
    expect(effect).toHaveBeenLastCalledWith(false, true);
  });

  // A callback captured at mount would animate with a stale accent, or call a
  // shared value that has since been replaced.
  it("calls the latest callback, not the one from the first render", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook<void, { value: number; cb: jest.Mock }>(
      ({ value, cb }) => useOnValueChange(value, cb),
      { initialProps: { value: 1, cb: first } },
    );

    rerender({ value: 2, cb: second });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not fire when only the callback changes", () => {
    const second = jest.fn();
    const { rerender } = renderHook<void, { value: number; cb: jest.Mock }>(
      ({ value, cb }) => useOnValueChange(value, cb),
      { initialProps: { value: 1, cb: jest.fn() } },
    );

    rerender({ value: 1, cb: second });
    expect(second).not.toHaveBeenCalled();
  });
});

describe("useOnValueChange with act", () => {
  it("fires from a state update inside the tree", () => {
    const effect = jest.fn();
    let setValue: ((n: number) => void) | undefined;

    const { result } = renderHook(() => {
      const [value, set] = useState(0);
      setValue = set;
      useOnValueChange(value, effect);
      return value;
    });

    expect(result.current).toBe(0);
    act(() => setValue?.(5));
    expect(effect).toHaveBeenCalledWith(5, 0);
  });
});
