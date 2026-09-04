import { act, waitFor } from "@testing-library/react-native";

import * as haptics from "@/lib/haptics";
import { useToggleGoal } from "@/hooks/useToggleGoal";
import { getTodayLocalDate } from "@/lib/date";
import { getTodayDayIndex } from "@/lib/repeatDays";
import { queryKeys } from "@/lib/queryKeys";
import { Goal, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
  renderHookWithSession,
} from "../test-utils/render";

const baseGoal: Goal = {
  id: "g-1",
  title: "Run",
  user_id: "user-1",
  group_id: "group-1",
  completed_today: false,
  icon: null,
  repeat_days: [0, 1, 2, 3, 4, 5, 6],
};

describe("useToggleGoal", () => {
  it("optimistically flips completed_today and inserts a log row", async () => {
    const insertQB = makeQueryBuilder({ error: null });
    const fromImpl = jest.fn(() => insertQB);
    const supabase = buildFakeSupabase({ fromImpl });

    const queryClient = makeQueryClient();
    queryClient.setQueryData<Member[]>(queryKeys.groupMembers("group-1"), [
      { user_id: "user-1", full_name: "Me", goals: [{ ...baseGoal }] },
    ]);

    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);

    await act(async () => {
      await utils.result.current.value.mutateAsync({ ...baseGoal });
    });

    expect(fromImpl).toHaveBeenCalledWith("logs");
    expect(insertQB.insert).toHaveBeenCalledWith(
      expect.objectContaining({ goal_id: "g-1", user_id: "user-1" }),
    );

    await waitFor(() => {
      const cached = queryClient.getQueryData<Member[]>(
        queryKeys.groupMembers("group-1"),
      );
      expect(cached?.[0].goals[0].completed_today).toBe(true);
    });
  });

  it("rolls back the cache when the supabase call errors", async () => {
    const errorQB = makeQueryBuilder({ error: { message: "nope" } });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => errorQB) });

    const queryClient = makeQueryClient();
    queryClient.setQueryData<Member[]>(queryKeys.groupMembers("group-1"), [
      { user_id: "user-1", full_name: "Me", goals: [{ ...baseGoal }] },
    ]);
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({ ...baseGoal }),
      ).rejects.toBeTruthy();
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Member[]>(
        queryKeys.groupMembers("group-1"),
      );
      expect(cached?.[0].goals[0].completed_today).toBe(false);
    });
  });

  it("removes the optimistic heatmap entry when nothing was cached before", async () => {
    const errorQB = makeQueryBuilder({ error: { message: "nope" } });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => errorQB) });

    const queryClient = makeQueryClient();
    queryClient.setQueryData<Member[]>(queryKeys.groupMembers("group-1"), [
      { user_id: "user-1", full_name: "Me", goals: [{ ...baseGoal }] },
    ]);
    // Deliberately no seeded heatmap: the optimistic patch invents one, so
    // rollback has to drop it rather than leave a fabricated count behind.
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({ ...baseGoal }),
      ).rejects.toBeTruthy();
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(["heatmap", "user-1"])).toBeUndefined();
    });
  });

  it("restores the previous heatmap counts when one was already cached", async () => {
    const errorQB = makeQueryBuilder({ error: { message: "nope" } });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => errorQB) });

    const queryClient = makeQueryClient();
    queryClient.setQueryData<Member[]>(queryKeys.groupMembers("group-1"), [
      { user_id: "user-1", full_name: "Me", goals: [{ ...baseGoal }] },
    ]);
    const today = getTodayLocalDate();
    queryClient.setQueryData(["heatmap", "user-1"], { [today]: 2 });
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({ ...baseGoal }),
      ).rejects.toBeTruthy();
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(["heatmap", "user-1"])).toEqual({
        [today]: 2,
      });
    });
  });

  it("deletes the log row when the goal was already completed today", async () => {
    const deleteQB = makeQueryBuilder({ error: null });
    const fromImpl = jest.fn(() => deleteQB);
    const supabase = buildFakeSupabase({ fromImpl });

    const queryClient = makeQueryClient();
    const completed = { ...baseGoal, completed_today: true };
    queryClient.setQueryData<Member[]>(queryKeys.groupMembers("group-1"), [
      { user_id: "user-1", full_name: "Me", goals: [completed] },
    ]);
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);

    await act(async () => {
      await utils.result.current.value.mutateAsync(completed);
    });

    expect(deleteQB.delete).toHaveBeenCalled();
    expect(deleteQB.eq).toHaveBeenCalledWith("goal_id", "g-1");
  });
});

// The haptic is chosen from the tap, never from what comes back over the wire —
// see the rules at the top of `lib/haptics.ts`.
describe("useToggleGoal haptics", () => {
  const seed = (
    queryClient: ReturnType<typeof makeQueryClient>,
    goals: Goal[],
  ) =>
    queryClient.setQueryData<Member[]>(queryKeys.groupMembers("group-1"), [
      { user_id: "user-1", full_name: "Me", goals },
      // A second member whose day is nowhere near done: the celebration is
      // about *my* habits, not the group's.
      {
        user_id: "user-2",
        full_name: "Ann",
        goals: [{ ...baseGoal, id: "other", user_id: "user-2" }],
      },
    ]);

  const run = async (goals: Goal[], toggled: Goal) => {
    const qb = makeQueryBuilder({ error: null });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
    const queryClient = makeQueryClient();
    seed(queryClient, goals);
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);

    await act(async () => {
      await utils.result.current.value.mutateAsync(toggled);
    });
  };

  let done: jest.SpyInstance;
  let undone: jest.SpyInstance;
  let party: jest.SpyInstance;

  beforeEach(() => {
    done = jest.spyOn(haptics, "toggleDone").mockImplementation(() => {});
    undone = jest.spyOn(haptics, "toggleUndone").mockImplementation(() => {});
    party = jest.spyOn(haptics, "celebrate").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it("confirms an ordinary tick while habits are still outstanding", async () => {
    const goals = [
      { ...baseGoal, id: "a" },
      { ...baseGoal, id: "b" },
    ];
    await run(goals, goals[0]);

    expect(done).toHaveBeenCalledTimes(1);
    expect(party).not.toHaveBeenCalled();
    expect(undone).not.toHaveBeenCalled();
  });

  it("celebrates instead when the tick closes out the day", async () => {
    const goals = [
      { ...baseGoal, id: "a", completed_today: true },
      { ...baseGoal, id: "b", completed_today: false },
    ];
    await run(goals, goals[1]);

    expect(party).toHaveBeenCalledTimes(1);
    // Otherwise the fanfare is just a louder version of the ordinary tick.
    expect(done).not.toHaveBeenCalled();
  });

  it("ignores habits not scheduled for today when deciding to celebrate", async () => {
    const notToday = (getTodayDayIndex() + 1) % 7;
    const goals = [
      { ...baseGoal, id: "a", completed_today: false },
      { ...baseGoal, id: "b", repeat_days: [notToday], completed_today: false },
    ];
    await run(goals, goals[0]);

    expect(party).toHaveBeenCalledTimes(1);
  });

  it("never celebrates on the way back down", async () => {
    const goals = [{ ...baseGoal, id: "a", completed_today: true }];
    await run(goals, goals[0]);

    expect(undone).toHaveBeenCalledTimes(1);
    expect(party).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });

  // An empty cache is the cold-start case: buzz the ordinary confirmation
  // rather than guessing at a milestone we cannot see.
  it("falls back to the plain tick when the group is not cached", async () => {
    const qb = makeQueryBuilder({ error: null });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
    const queryClient = makeQueryClient();
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);

    await act(async () => {
      await utils.result.current.value.mutateAsync({ ...baseGoal });
    });

    expect(done).toHaveBeenCalledTimes(1);
    expect(party).not.toHaveBeenCalled();
  });
});
