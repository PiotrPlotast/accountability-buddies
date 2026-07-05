import { act, waitFor } from "@testing-library/react-native";

import { useToggleGoal } from "@/hooks/useToggleGoal";
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
