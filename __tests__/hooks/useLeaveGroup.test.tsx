import { act, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import * as haptics from "@/lib/haptics";
import { useLeaveGroup } from "@/hooks/useLeaveGroup";
import { queryKeys } from "@/lib/queryKeys";
import { GroupResult } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
  renderHookWithSession,
} from "../test-utils/render";

const stats: GroupResult = {
  group_id: "group-1",
  name: "Habit Crew",
  icon: "👥",
  current_streak: 3,
  invite_code: "ABCDEF0123",
  last_streak_date: null,
  groups: { last_streak_date: null, current_streak: 3 },
};

function setup(result: { data?: unknown; error?: { message: string } | null }) {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
  queryClient.setQueryData(queryKeys.groupMembers("group-1", "2026-10-17"), []);
  const rpcImpl = jest.fn(() => makeQueryBuilder(result));
  const fromImpl = jest.fn(() => makeQueryBuilder({ error: null }));
  const supabase = buildFakeSupabase({ rpcImpl, fromImpl });
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  return { queryClient, rpcImpl, fromImpl, Wrapper };
}

async function leave(
  Wrapper: React.ComponentType<{ children: React.ReactNode }>,
) {
  const utils = await renderHookWithSession(() => useLeaveGroup(), Wrapper);
  await act(async () => {
    await utils.result.current.value.mutateAsync().catch(() => {});
  });
  await waitFor(() => {
    const m = utils.result.current.value;
    expect(m.isSuccess || m.isError).toBe(true);
  });
  return utils;
}

describe("useLeaveGroup", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("leaves through the RPC, never through a table", async () => {
    const { rpcImpl, fromImpl, Wrapper } = setup({
      data: { success: true },
      error: null,
    });

    await leave(Wrapper);

    expect(rpcImpl).toHaveBeenCalledWith("leave_group");
    // The last-member clean-up and the creator hand-over happen in the same
    // transaction as the delete, so a table delete would half-finish.
    expect(fromImpl).not.toHaveBeenCalled();
  });

  it("leaves you with no group, so the dashboard sends you to join one", async () => {
    const { queryClient, Wrapper } = setup({
      data: { success: true },
      error: null,
    });

    await leave(Wrapper);

    expect(queryClient.getQueryData(queryKeys.groupStats("user-1"))).toBeNull();
    // The old group's members are nobody you can see any more.
    expect(
      queryClient.getQueryData(queryKeys.groupMembers("group-1", "2026-10-17")),
    ).toBeUndefined();
  });

  it("buzzes once on the confirming tap", async () => {
    const destructive = jest.spyOn(haptics, "destructive");
    const { Wrapper } = setup({ data: { success: true }, error: null });

    await leave(Wrapper);

    expect(destructive).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal and keeps you in the group", async () => {
    const buzz = jest.spyOn(haptics, "error");
    const { queryClient, Wrapper } = setup({
      data: { success: false, message: "You're not in a group" },
      error: null,
    });

    await leave(Wrapper);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't leave the group",
      "You're not in a group",
    );
    expect(buzz).toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.groupStats("user-1"))).toEqual(
      stats,
    );
  });

  it("shows a readable message when the request fails", async () => {
    const { queryClient, Wrapper } = setup({
      data: null,
      error: { message: "permission denied for function leave_group" },
    });

    await leave(Wrapper);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't leave the group",
      "permission denied for function leave_group",
    );
    expect(queryClient.getQueryData(queryKeys.groupStats("user-1"))).toEqual(
      stats,
    );
  });
});
