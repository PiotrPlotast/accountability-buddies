import { AppState, Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

import { useTodayLocalDate } from "@/hooks/useTodayLocalDate";

// Rendered through a component so the render-count test has something to
// count.
const onRender = jest.fn();
function Probe() {
  onRender();
  return <Text testID="today">{useTodayLocalDate()}</Text>;
}

const today = () => screen.getByTestId("today").props.children;

const remove = jest.fn();

/** The listener the mounted hook handed to AppState, and a way to fire it. */
function emitAppState(state: string) {
  // `lastCall`, not `calls[0]`: the spy's history outlives a test, so the
  // first call can belong to an earlier test's long-unmounted Probe.
  const addListener = AppState.addEventListener as unknown as jest.Mock;
  const handler = addListener.mock.lastCall[1];
  act(() => handler(state));
}

beforeEach(() => {
  onRender.mockClear();
  remove.mockClear();
  jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove } as never);
  // Local-time constructor, so the test means "23:59:30 wherever this runs".
  jest.useFakeTimers({ now: new Date(2026, 9, 5, 23, 59, 30) });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useTodayLocalDate", () => {
  it("returns today's local date on mount", () => {
    render(<Probe />);
    expect(today()).toBe("2026-10-05");
  });

  it("rolls over at local midnight while the app stays open", () => {
    render(<Probe />);

    act(() => jest.advanceTimersByTime(29_000));
    expect(today()).toBe("2026-10-05");

    act(() => jest.advanceTimersByTime(1_000));
    expect(today()).toBe("2026-10-06");
  });

  it("keeps rolling over on every following midnight", () => {
    render(<Probe />);

    act(() => jest.advanceTimersByTime(30_000));
    act(() => jest.advanceTimersByTime(24 * 60 * 60 * 1000));
    expect(today()).toBe("2026-10-07");
  });

  it("catches up when the app returns to the foreground", () => {
    render(<Probe />);

    // Timers don't run while the app is suspended: the clock moves on two
    // days without the midnight timer ever firing.
    jest.setSystemTime(new Date(2026, 9, 7, 9, 0, 0));
    expect(today()).toBe("2026-10-05");

    emitAppState("active");
    expect(today()).toBe("2026-10-07");
  });

  it("ignores app states other than active", () => {
    render(<Probe />);

    jest.setSystemTime(new Date(2026, 9, 7, 9, 0, 0));
    emitAppState("background");
    expect(today()).toBe("2026-10-05");
  });

  it("does not re-render when the date has not changed", () => {
    render(<Probe />);
    const before = onRender.mock.calls.length;

    emitAppState("active");
    expect(onRender).toHaveBeenCalledTimes(before);
  });

  it("re-arms the midnight timer after a foreground catch-up", () => {
    render(<Probe />);

    jest.setSystemTime(new Date(2026, 9, 7, 23, 59, 0));
    emitAppState("active");
    expect(today()).toBe("2026-10-07");

    act(() => jest.advanceTimersByTime(60_000));
    expect(today()).toBe("2026-10-08");
  });

  it("clears its timer and listener on unmount", () => {
    const { unmount } = render(<Probe />);
    unmount();

    expect(remove).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
