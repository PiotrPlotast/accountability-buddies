import { AppState } from "react-native";
import { act, waitFor } from "@testing-library/react-native";

import { useGroupMembers } from "@/hooks/useGroupMembers";
import { getLocalDateDaysAgo, getTodayLocalDate } from "@/lib/date";

import { queryKeys } from "@/lib/queryKeys";
import { Goal, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
  renderHookWithSession,
} from "../test-utils/render";

describe("useGroupMembers", () => {
  it("maps members and derives completed_today from today's logs", async () => {
    const today = getTodayLocalDate();
    const yesterday = getLocalDateDaysAgo(1);
    const membersQB = makeQueryBuilder({
      data: [{ user_id: "user-1", profiles: { full_name: "Ada Lovelace" } }],
      error: null,
    });
    const goalsQB = makeQueryBuilder({
      data: [
        {
          id: "g-1",
          user_id: "user-1",
          title: "Run",
          group_id: "group-1",
          icon: null,
          repeat_days: [0, 1, 2],
          // Two logs in the trailing window, one of them today.
          logs: [
            { id: "l-1", date: yesterday },
            { id: "l-2", date: today },
          ],
        },
        {
          id: "g-2",
          user_id: "user-1",
          title: "Read",
          group_id: "group-1",
          icon: null,
          repeat_days: [0],
          logs: [{ id: "l-3", date: yesterday }],
        },
      ],
      error: null,
    });
    const fromImpl = jest.fn((table: string) =>
      table === "group_members" ? membersQB : goalsQB,
    );
    const supabase = buildFakeSupabase({ fromImpl });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useGroupMembers({ groupId: "group-1" }),
      Wrapper,
    );

    await waitFor(() => {
      expect(utils.result.current.value.data).toEqual([
        {
          user_id: "user-1",
          full_name: "Ada Lovelace",
          goals: [
            expect.objectContaining({
              id: "g-1",
              completed_today: true,
              completed_dates: [yesterday, today],
            }),
            expect.objectContaining({
              id: "g-2",
              completed_today: false,
              completed_dates: [yesterday],
            }),
          ],
        },
      ]);
    });
  });

  it("reads each habit's reminder time as HH:MM, or null", async () => {
    const membersQB = makeQueryBuilder({
      data: [{ user_id: "user-1", profiles: { full_name: "Ada" } }],
      error: null,
    });
    const base = {
      user_id: "user-1",
      group_id: "group-1",
      icon: null,
      repeat_days: [0],
      logs: [],
    };
    const goalsQB = makeQueryBuilder({
      data: [
        { ...base, id: "g-1", title: "Run", reminder_time: "08:30:00" },
        { ...base, id: "g-2", title: "Read", reminder_time: null },
      ],
      error: null,
    });
    const supabase = buildFakeSupabase({
      fromImpl: jest.fn((table: string) =>
        table === "group_members" ? membersQB : goalsQB,
      ),
    });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useGroupMembers({ groupId: "group-1" }),
      Wrapper,
    );

    await waitFor(() => {
      const goals = utils.result.current.value.data?.[0].goals;
      expect(goals?.map((g) => g.reminder_time)).toEqual(["08:30", null]);
    });
    expect(goalsQB.select).toHaveBeenCalledWith(
      expect.stringContaining("reminder_time"),
    );
  });

  // Regression: this used to `return []` on error, which React Query caches and
  // persists as a successful empty group — indistinguishable from "no members".
  it("surfaces an error instead of resolving to an empty member list", async () => {
    const membersQB = makeQueryBuilder({
      data: null,
      error: { message: "permission denied for table group_members" },
    });
    const goalsQB = makeQueryBuilder({ data: [], error: null });
    const fromImpl = jest.fn((table: string) =>
      table === "group_members" ? membersQB : goalsQB,
    );
    const supabase = buildFakeSupabase({ fromImpl });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useGroupMembers({ groupId: "group-1" }),
      Wrapper,
    );

    await waitFor(() => {
      expect(utils.result.current.value.isError).toBe(true);
    });
    expect(utils.result.current.value.data).toBeUndefined();
  });

  it("surfaces an error when the goals query fails", async () => {
    const membersQB = makeQueryBuilder({ data: [], error: null });
    const goalsQB = makeQueryBuilder({
      data: null,
      error: { message: "boom" },
    });
    const fromImpl = jest.fn((table: string) =>
      table === "group_members" ? membersQB : goalsQB,
    );
    const supabase = buildFakeSupabase({ fromImpl });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useGroupMembers({ groupId: "group-1" }),
      Wrapper,
    );

    await waitFor(() => {
      expect(utils.result.current.value.isError).toBe(true);
    });
  });
});

describe("useGroupMembers across midnight", () => {
  const ticked: Goal = {
    id: "g-1",
    user_id: "user-1",
    title: "Run",
    group_id: "group-1",
    icon: null,
    repeat_days: [],
    completed_today: true,
    completed_dates: ["2026-10-04", "2026-10-05"],
  };
  const yesterdaysMembers: Member[] = [
    { user_id: "user-1", full_name: "Ada Lovelace", goals: [ticked] },
  ];

  /** A fetch that never answers — the phone is offline. */
  function offlineBuilder() {
    const qb = makeQueryBuilder({ data: [], error: null });
    (qb as unknown as { then: unknown }).then = () => new Promise(() => {});
    return qb;
  }

  const remove = jest.fn();
  function emitAppState(state: string) {
    const addListener = AppState.addEventListener as unknown as jest.Mock;
    act(() => addListener.mock.lastCall[1](state));
  }

  beforeEach(() => {
    jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove } as never);
    // Monday, half a minute before local midnight.
    jest.useFakeTimers({ now: new Date(2026, 9, 5, 23, 59, 30) });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function renderSeeded(seed: Member[] = yesterdaysMembers) {
    const goalsQB = offlineBuilder();
    const fromImpl = jest.fn((table: string) =>
      table === "group_members" ? offlineBuilder() : goalsQB,
    );
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      queryKeys.groupMembers("group-1", "2026-10-05"),
      seed,
    );
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase({ fromImpl }),
      queryClient,
    });
    const utils = await renderHookWithSession(
      () => useGroupMembers({ groupId: "group-1" }),
      Wrapper,
    );
    return { utils, fromImpl, goalsQB, queryClient };
  }

  it("reads and caches under the local day it is asking about", async () => {
    const { utils } = await renderSeeded();
    expect(utils.result.current.value.data?.[0].goals[0].completed_today).toBe(
      true,
    );
  });

  it("clears the ticks at midnight without waiting for the network", async () => {
    const { utils, fromImpl, goalsQB } = await renderSeeded();

    act(() => jest.advanceTimersByTime(30_000));

    await waitFor(() =>
      expect(
        utils.result.current.value.data?.[0].goals[0].completed_today,
      ).toBe(false),
    );
    // Same habits, unticked — not a loading state or an empty group.
    expect(utils.result.current.value.isLoading).toBe(false);
    expect(utils.result.current.value.data?.[0].goals[0].title).toBe("Run");
    // And it went to fetch the new day.
    expect(fromImpl).toHaveBeenCalledWith("goals");
    expect(goalsQB.lte).toHaveBeenCalledWith("logs.date", "2026-10-06");
  });

  it("never shows yesterday's ticks on a cold start the next day", async () => {
    jest.setSystemTime(new Date(2026, 9, 6, 9, 0, 0));
    const { utils } = await renderSeeded();

    expect(utils.result.current.value.isLoading).toBe(false);
    expect(utils.result.current.value.data?.[0].goals[0].completed_today).toBe(
      false,
    );
  });

  it("catches up when the app returns to the foreground on a later day", async () => {
    const { utils } = await renderSeeded();

    // Suspended overnight: the midnight timer never ran.
    jest.setSystemTime(new Date(2026, 9, 7, 9, 0, 0));
    emitAppState("active");

    await waitFor(() =>
      expect(
        utils.result.current.value.data?.[0].goals[0].completed_today,
      ).toBe(false),
    );
  });

  it("never borrows another group's members to fill the gap", async () => {
    jest.setSystemTime(new Date(2026, 9, 6, 9, 0, 0));
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      queryKeys.groupMembers("group-2", "2026-10-05"),
      yesterdaysMembers,
    );
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase({ fromImpl: jest.fn(offlineBuilder) }),
      queryClient,
    });

    const utils = await renderHookWithSession(
      () => useGroupMembers({ groupId: "group-1" }),
      Wrapper,
    );

    expect(utils.result.current.value.data).toBeUndefined();
  });
});
