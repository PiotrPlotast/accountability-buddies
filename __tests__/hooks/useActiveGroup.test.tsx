import { act, waitFor } from "@testing-library/react-native";

import { useActiveGroup } from "@/hooks/useActiveGroup";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { GroupResult, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
  renderHookWithSession,
} from "../test-utils/render";

const router = require("expo-router").__router as { replace: jest.Mock };

const GROUP: GroupResult = {
  group_id: "g1",
  name: "Gym crew",
  icon: "🏋️",
  current_streak: 4,
  invite_code: "ABCDEF0123",
  last_streak_date: null,
  groups: { last_streak_date: null, current_streak: 4 },
};

const goal = (id: string, user_id: string) => ({
  id,
  user_id,
  title: id,
  group_id: "g1",
  icon: null,
  repeat_days: [],
  completed_today: false,
  completed_dates: [],
});

const MEMBERS: Member[] = [
  { user_id: "user-1", full_name: "Me", goals: [goal("mine", "user-1")] },
  { user_id: "user-2", full_name: "Buddy", goals: [goal("theirs", "user-2")] },
];

/** A user whose group and members are already in the cache. */
function buildWithGroup(rpcImpl?: jest.Mock) {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.groupStats("user-1"), GROUP);
  queryClient.setQueryData(
    queryKeys.groupMembers("g1", getTodayLocalDate()),
    MEMBERS,
  );
  return buildWrapper({
    supabase: buildFakeSupabase({ rpcImpl }),
    queryClient,
  });
}

function buildNoGroup() {
  const supabase = buildFakeSupabase({
    rpcImpl: jest.fn(() => makeQueryBuilder({ data: null, error: null })),
    fromImpl: jest.fn(() =>
      makeQueryBuilder({
        data: { full_name: "Piotr", avatar_url: null },
        error: null,
      }),
    ),
  });
  return buildWrapper({ supabase, queryClient: makeQueryClient() });
}

describe("useActiveGroup", () => {
  beforeEach(() => {
    router.replace.mockClear();
  });

  it("maps the active group and its members", async () => {
    const { Wrapper } = buildWithGroup();

    const { result } = await renderHookWithSession(
      () => useActiveGroup(),
      Wrapper,
    );

    const v = result.current.value;
    expect(v.userId).toBe("user-1");
    expect(v.loading).toBe(false);
    expect(v.activeGroupId).toBe("g1");
    expect(v.groupName).toBe("Gym crew");
    expect(v.groupIcon).toBe("🏋️");
    expect(v.streak).toBe(4);
    expect(v.inviteCode).toBe("ABCDEF0123");
    expect(v.members).toEqual(MEMBERS);
    expect(v.hasNoGroup).toBe(false);
  });

  it("picks out the signed-in user's own goals", async () => {
    const { Wrapper } = buildWithGroup();

    const { result } = await renderHookWithSession(
      () => useActiveGroup(),
      Wrapper,
    );

    expect(result.current.value.myGoals.map((g) => g.id)).toEqual(["mine"]);
  });

  it("reports a group-less user with empty defaults", async () => {
    const { Wrapper } = buildNoGroup();

    const { result } = await renderHookWithSession(
      () => useActiveGroup(),
      Wrapper,
    );

    await waitFor(() => expect(result.current.value.hasNoGroup).toBe(true));
    const v = result.current.value;
    expect(v.loading).toBe(false);
    expect(v.activeGroupId).toBeNull();
    expect(v.groupName).toBeNull();
    expect(v.groupIcon).toBe("👥");
    expect(v.streak).toBe(0);
    expect(v.inviteCode).toBe("");
    expect(v.members).toEqual([]);
    expect(v.myGoals).toEqual([]);
  });

  // Offline with nothing cached, the read fails. That is "couldn't ask",
  // never "asked and you have no group", which would send them to join-group.
  it("is not group-less when the stats read failed", async () => {
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase({
        rpcImpl: jest.fn(() =>
          makeQueryBuilder({ data: null, error: { message: "offline" } }),
        ),
      }),
    });

    const { result } = await renderHookWithSession(
      () => useActiveGroup(),
      Wrapper,
    );

    await waitFor(() => expect(result.current.value.isError).toBe(true));
    expect(result.current.value.hasNoGroup).toBe(false);
  });

  it("is loading, not group-less, before the stats arrive", async () => {
    // A stats read that never settles.
    const rpcImpl = jest.fn(() => ({
      maybeSingle: () => new Promise(() => {}),
    }));
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase({ rpcImpl }),
    });

    const { result } = await renderHookWithSession(
      () => useActiveGroup(),
      Wrapper,
    );

    expect(result.current.value.loading).toBe(true);
    expect(result.current.value.hasNoGroup).toBe(false);
  });

  // The whole point of the split: a modal or a screen that reads the group
  // must not carry its own copy of the dashboard's redirect.
  it("never navigates, even for a named user with no group", async () => {
    const { Wrapper } = buildNoGroup();

    const { result } = await renderHookWithSession(
      () => useActiveGroup(),
      Wrapper,
    );

    await waitFor(() => expect(result.current.value.hasNoGroup).toBe(true));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("refetch re-reads the group stats", async () => {
    const rpcImpl = jest.fn(() =>
      makeQueryBuilder({ data: GROUP, error: null }),
    );
    const { Wrapper } = buildWithGroup(rpcImpl);

    const { result } = await renderHookWithSession(
      () => useActiveGroup(),
      Wrapper,
    );
    expect(rpcImpl).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.value.refetch();
    });

    expect(rpcImpl).toHaveBeenCalledWith("get_my_group_stats", {
      p_today: expect.any(String),
    });
  });
});
