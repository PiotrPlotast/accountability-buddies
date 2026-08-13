import { waitFor } from "@testing-library/react-native";

import { useGroupMembers } from "@/hooks/useGroupMembers";
import { getLocalDateDaysAgo, getTodayLocalDate } from "@/lib/date";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
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
