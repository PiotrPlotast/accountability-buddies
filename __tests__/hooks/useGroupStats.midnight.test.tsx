import { AppState } from "react-native";
import { act, waitFor } from "@testing-library/react-native";

import { useGroupStats } from "@/hooks/useGroupStats";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  renderHookWithSession,
} from "../test-utils/render";

// Kept apart from useGroupStats.test.tsx, which pins `getTodayLocalDate` to a
// constant — a clock that never reaches midnight.
describe("useGroupStats across midnight", () => {
  const remove = jest.fn();

  function emitAppState(state: string) {
    const addListener = AppState.addEventListener as unknown as jest.Mock;
    act(() => addListener.mock.lastCall[1](state));
  }

  beforeEach(() => {
    jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove } as never);
    jest.useFakeTimers({ now: new Date(2026, 9, 5, 23, 59, 30) });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function renderStats() {
    const rpcImpl = jest.fn(() =>
      makeQueryBuilder({ data: null, error: null }),
    );
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase({ rpcImpl }),
    });
    await renderHookWithSession(() => useGroupStats(), Wrapper);
    await waitFor(() => expect(rpcImpl).toHaveBeenCalledTimes(1));
    return rpcImpl;
  }

  // The streak is judged against `p_today`, so yesterday's answer is stale
  // the moment the day changes.
  it("asks again for the new day's streak at midnight", async () => {
    const rpcImpl = await renderStats();

    act(() => jest.advanceTimersByTime(30_000));

    await waitFor(() => expect(rpcImpl).toHaveBeenCalledTimes(2));
    expect(rpcImpl).toHaveBeenLastCalledWith("get_my_group_stats", {
      p_today: "2026-10-06",
    });
  });

  it("asks again on a foreground return on a later day", async () => {
    const rpcImpl = await renderStats();

    jest.setSystemTime(new Date(2026, 9, 7, 9, 0, 0));
    emitAppState("active");

    await waitFor(() => expect(rpcImpl).toHaveBeenCalledTimes(2));
    expect(rpcImpl).toHaveBeenLastCalledWith("get_my_group_stats", {
      p_today: "2026-10-07",
    });
  });

  it("does not ask again on a foreground return the same day", async () => {
    const rpcImpl = await renderStats();

    emitAppState("active");
    act(() => jest.advanceTimersByTime(1_000));

    expect(rpcImpl).toHaveBeenCalledTimes(1);
  });
});
