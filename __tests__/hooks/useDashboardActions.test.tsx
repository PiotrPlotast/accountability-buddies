import { act, waitFor } from "@testing-library/react-native";

import { useDashboardActions } from "@/hooks/useDashboardActions";
import { getTodayLocalDate } from "@/lib/date";
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
  queryClient.setQueryData(
    queryKeys.groupMembers("group-1", getTodayLocalDate()),
    members,
  );
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
      await utils.result.current.value.editGoal("g-1", { title: "new" });
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
      // Made on the phone (the mocked `randomUUID`), so a change queued behind
      // an offline create can point at it.
      id: "00000000-0000-4000-8000-000000000000",
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
      await utils.result.current.value.editGoal("g-1", { title: "  Walk  " });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Member[]>(
        queryKeys.groupMembers("group-1", getTodayLocalDate()),
      );
      expect(cached?.[0].goals[0].title).toBe("Walk");
    });
    expect(editQB.update).toHaveBeenCalledWith({ title: "Walk" });
  });

  it("editGoal leaves icon and repeat days untouched when they aren't passed", async () => {
    const editQB = makeQueryBuilder({ error: null });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => editQB) });
    const queryClient = makeQueryClient();
    seed(queryClient, [
      { user_id: "user-1", full_name: "Me", goals: [{ ...goal, icon: "🏃" }] },
    ]);
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(
      () => useDashboardActions("group-1"),
      Wrapper,
    );

    await act(async () => {
      await utils.result.current.value.editGoal("g-1", { title: "Walk" });
    });

    expect(editQB.update).toHaveBeenCalledWith({ title: "Walk" });
    const cached = queryClient.getQueryData<Member[]>(
      queryKeys.groupMembers("group-1", getTodayLocalDate()),
    );
    expect(cached?.[0].goals[0].icon).toBe("🏃");
  });

  it("editGoal writes the new icon and repeat days when they are passed", async () => {
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
      await utils.result.current.value.editGoal("g-1", {
        title: "Walk",
        icon: "🚶",
        repeatDays: [0, 2, 4],
      });
    });

    expect(editQB.update).toHaveBeenCalledWith({
      title: "Walk",
      icon: "🚶",
      repeat_days: [0, 2, 4],
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Member[]>(
        queryKeys.groupMembers("group-1", getTodayLocalDate()),
      );
      expect(cached?.[0].goals[0]).toMatchObject({
        title: "Walk",
        icon: "🚶",
        repeat_days: [0, 2, 4],
      });
    });
  });

  it("editGoal treats an empty day selection as every day", async () => {
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
      await utils.result.current.value.editGoal("g-1", {
        title: "Walk",
        repeatDays: [],
      });
    });

    expect(editQB.update).toHaveBeenCalledWith({
      title: "Walk",
      repeat_days: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  describe("reminder time", () => {
    function setup(goals: Goal[] = [{ ...goal }]) {
      const qb = makeQueryBuilder({
        data: { ...goal, id: "real-id" },
        error: null,
      });
      const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
      const queryClient = makeQueryClient();
      seed(queryClient, [{ user_id: "user-1", full_name: "Me", goals }]);
      const { Wrapper } = buildWrapper({ supabase, queryClient });
      const cached = () =>
        queryClient.getQueryData<Member[]>(
          queryKeys.groupMembers("group-1", getTodayLocalDate()),
        )?.[0].goals;
      return { qb, Wrapper, cached };
    }

    it("addGoal saves the reminder time and shows it on the optimistic row", async () => {
      const { qb, Wrapper, cached } = setup([]);
      // Hold the insert so the optimistic row is what the cache shows.
      qb.single.mockReturnValueOnce(new Promise(() => {}));
      const utils = await renderHookWithSession(
        () => useDashboardActions("group-1"),
        Wrapper,
      );

      act(() => {
        void utils.result.current.value.addGoal("Run", {
          reminderTime: "08:30",
        });
      });

      await waitFor(() =>
        expect(qb.insert).toHaveBeenCalledWith(
          expect.objectContaining({ reminder_time: "08:30" }),
        ),
      );
      expect(cached()?.[0].reminder_time).toBe("08:30");
    });

    it("addGoal without a reminder leaves the column out", async () => {
      const { qb, Wrapper } = setup([]);
      const utils = await renderHookWithSession(
        () => useDashboardActions("group-1"),
        Wrapper,
      );

      await act(async () => {
        await utils.result.current.value.addGoal("Run");
      });

      expect(qb.insert.mock.calls[0][0]).not.toHaveProperty("reminder_time");
    });

    it("editGoal sets and clears the reminder time", async () => {
      const { qb, Wrapper, cached } = setup([
        { ...goal, reminder_time: "07:00" },
      ]);
      const utils = await renderHookWithSession(
        () => useDashboardActions("group-1"),
        Wrapper,
      );

      await act(async () => {
        await utils.result.current.value.editGoal("g-1", {
          title: "Run",
          reminderTime: "08:15",
        });
      });
      expect(qb.update).toHaveBeenLastCalledWith({
        title: "Run",
        reminder_time: "08:15",
      });
      await waitFor(() => expect(cached()?.[0].reminder_time).toBe("08:15"));

      await act(async () => {
        await utils.result.current.value.editGoal("g-1", {
          title: "Run",
          reminderTime: null,
        });
      });
      expect(qb.update).toHaveBeenLastCalledWith({
        title: "Run",
        reminder_time: null,
      });
      await waitFor(() => expect(cached()?.[0].reminder_time).toBeNull());
    });

    it("editGoal leaves the reminder alone when it isn't passed", async () => {
      const { qb, Wrapper, cached } = setup([
        { ...goal, reminder_time: "07:00" },
      ]);
      const utils = await renderHookWithSession(
        () => useDashboardActions("group-1"),
        Wrapper,
      );

      await act(async () => {
        await utils.result.current.value.editGoal("g-1", { title: "Walk" });
      });

      expect(qb.update).toHaveBeenCalledWith({ title: "Walk" });
      expect(cached()?.[0].reminder_time).toBe("07:00");
    });
  });
});
