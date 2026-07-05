import { renderHook, waitFor } from "@testing-library/react-native";

import { useDashboardStatus } from "@/hooks/useDashboardStatus";
import { queryKeys } from "@/lib/queryKeys";
import { getTodayLocalDate } from "@/lib/date";
import { Goal, GroupResult, Member } from "@/types/dashboardTypes";

import { buildFakeSupabase, buildWrapper, makeQueryClient } from "../test-utils/render";

const goal: Goal = {
  id: "g-1",
  title: "Run",
  user_id: "user-1",
  group_id: "group-1",
  completed_today: true,
  icon: null,
  repeat_days: [0, 1, 2, 3, 4, 5, 6],
};

function seedQueries(
  queryClient: ReturnType<typeof makeQueryClient>,
  stats: GroupResult,
  members: Member[],
  userId: string,
) {
  queryClient.setQueryData(queryKeys.groupStats(userId), stats);
  queryClient.setQueryData(queryKeys.groupMembers(stats.group_id), members);
}

describe("useDashboardStatus.isWaiting", () => {
  it("is true when I have contributed today but the streak hasn't ticked yet", async () => {
    const supabase = buildFakeSupabase({ userId: "user-1" });
    const queryClient = makeQueryClient();
    seedQueries(
      queryClient,
      {
        group_id: "group-1",
        name: "G",
        icon: "👥",
        current_streak: 0,
        invite_code: "X",
        last_streak_date: "1999-01-01",
        groups: { last_streak_date: "1999-01-01", current_streak: 0 },
      },
      [{ user_id: "user-1", full_name: "Me", goals: [goal] }],
      "user-1",
    );
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const { result } = renderHook(() => useDashboardStatus("user-1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isWaiting).toBe(true);
    });
  });

  it("is false when the streak already ticked today", async () => {
    const supabase = buildFakeSupabase({ userId: "user-1" });
    const queryClient = makeQueryClient();
    const today = getTodayLocalDate();
    seedQueries(
      queryClient,
      {
        group_id: "group-1",
        name: "G",
        icon: "👥",
        current_streak: 1,
        invite_code: "X",
        last_streak_date: today,
        groups: { last_streak_date: today, current_streak: 1 },
      },
      [{ user_id: "user-1", full_name: "Me", goals: [goal] }],
      "user-1",
    );
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const { result } = renderHook(() => useDashboardStatus("user-1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isWaiting).toBe(false);
    });
  });

  it("is false when I haven't completed any goal today", async () => {
    const supabase = buildFakeSupabase({ userId: "user-1" });
    const queryClient = makeQueryClient();
    seedQueries(
      queryClient,
      {
        group_id: "group-1",
        name: "G",
        icon: "👥",
        current_streak: 0,
        invite_code: "X",
        last_streak_date: "1999-01-01",
        groups: { last_streak_date: "1999-01-01", current_streak: 0 },
      },
      [
        {
          user_id: "user-1",
          full_name: "Me",
          goals: [{ ...goal, completed_today: false }],
        },
      ],
      "user-1",
    );
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const { result } = renderHook(() => useDashboardStatus("user-1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isWaiting).toBe(false);
    });
  });
});
