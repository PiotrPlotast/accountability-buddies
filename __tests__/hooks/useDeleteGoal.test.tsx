import { act, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useDeleteGoal } from "@/hooks/useDeleteGoal";
import { queryKeys } from "@/lib/queryKeys";
import { Goal, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
  renderHookWithSession,
} from "../test-utils/render";

const goal: Goal = {
  id: "g-1",
  title: "Run",
  user_id: "user-1",
  group_id: "group-1",
  completed_today: false,
  icon: null,
  repeat_days: [0, 1, 2, 3, 4, 5, 6],
};

describe("useDeleteGoal", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it("removes the goal from the cache when the row is deleted", async () => {
    const deleteQB = makeQueryBuilder({ data: { id: "g-1" }, error: null });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => deleteQB) });

    const queryClient = makeQueryClient();
    queryClient.setQueryData<Member[]>(queryKeys.groupMembers("group-1"), [
      { user_id: "user-1", full_name: "Me", goals: [goal] },
    ]);
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(() => useDeleteGoal(), Wrapper);

    await act(async () => {
      await utils.result.current.value.mutateAsync({
        goalId: "g-1",
        groupId: "group-1",
      });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Member[]>(
        queryKeys.groupMembers("group-1"),
      );
      expect(cached?.[0].goals).toHaveLength(0);
    });
  });

  it("alerts and rolls back when the row could not be deleted", async () => {
    const deleteQB = makeQueryBuilder({ data: null, error: null });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => deleteQB) });

    const queryClient = makeQueryClient();
    queryClient.setQueryData<Member[]>(queryKeys.groupMembers("group-1"), [
      { user_id: "user-1", full_name: "Me", goals: [goal] },
    ]);
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(() => useDeleteGoal(), Wrapper);

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({
          goalId: "g-1",
          groupId: "group-1",
        }),
      ).rejects.toBeTruthy();
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Member[]>(
        queryKeys.groupMembers("group-1"),
      );
      expect(cached?.[0].goals).toHaveLength(1);
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Error",
      expect.stringContaining("Could not delete"),
    );
  });
});
