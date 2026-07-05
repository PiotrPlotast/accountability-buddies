import { act, waitFor } from "@testing-library/react-native";

import { useDashboardActions } from "@/hooks/useDashboardActions";
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

function seed(
  queryClient: ReturnType<typeof makeQueryClient>,
  members: Member[],
) {
  queryClient.setQueryData(queryKeys.groupMembers("group-1"), members);
}

describe("useDashboardActions", () => {
  it("addGoal/deleteGoal/editGoal are no-ops when activeGroupId is null", async () => {
    const supabase = buildFakeSupabase();
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useDashboardActions(null),
      Wrapper,
    );

    await act(async () => {
      await utils.result.current.value.addGoal("anything");
      await utils.result.current.value.editGoal("g-1", "new");
      await utils.result.current.value.deleteGoal("g-1");
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("addGoal calls supabase.from('goals') with trimmed title and default repeat days", async () => {
    const insertedQB = makeQueryBuilder({
      data: { ...goal, id: "real-id", title: "Run" },
      error: null,
    });
    const fromImpl = jest.fn(() => insertedQB);
    const supabase = buildFakeSupabase({ fromImpl });
    const queryClient = makeQueryClient();
    seed(queryClient, [{ user_id: "user-1", full_name: "Me", goals: [] }]);
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(
      () => useDashboardActions("group-1"),
      Wrapper,
    );

    await act(async () => {
      await utils.result.current.value.addGoal("  Run  ", { icon: "🏃" });
    });

    expect(fromImpl).toHaveBeenCalledWith("goals");
    expect(insertedQB.insert).toHaveBeenCalledWith({
      title: "Run",
      user_id: "user-1",
      group_id: "group-1",
      icon: "🏃",
      repeat_days: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it("editGoal updates and patches the cache optimistically", async () => {
    const editQB = makeQueryBuilder({ error: null });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => editQB) });
    const queryClient = makeQueryClient();
    seed(queryClient, [
      { user_id: "user-1", full_name: "Me", goals: [{ ...goal }] },
    ]);
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(
      () => useDashboardActions("group-1"),
      Wrapper,
    );

    await act(async () => {
      await utils.result.current.value.editGoal("g-1", "  Walk  ");
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Member[]>(
        queryKeys.groupMembers("group-1"),
      );
      expect(cached?.[0].goals[0].title).toBe("Walk");
    });
    expect(editQB.update).toHaveBeenCalledWith({ title: "Walk" });
  });
});
