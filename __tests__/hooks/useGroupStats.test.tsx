import { waitFor } from "@testing-library/react-native";

import { useGroupStats } from "@/hooks/useGroupStats";
import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  renderHookWithSession,
} from "../test-utils/render";

// A date no clock would produce today, so the assertion can only pass if the
// value came from this helper — the one definition of "today" that
// `logs.date` is written with.
jest.mock("@/lib/date", () => ({
  ...jest.requireActual("@/lib/date"),
  getTodayLocalDate: () => "2031-01-02",
}));

describe("useGroupStats", () => {
  // The server used to judge "is the streak stale?" against its own UTC date,
  // which runs a day ahead of anyone west of UTC every evening — so their
  // streak read as broken while their day was still open.
  it("asks for the stats relative to the caller's local date", async () => {
    const rpcImpl = jest.fn(() =>
      makeQueryBuilder({ data: null, error: null }),
    );
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase({ rpcImpl }),
    });

    await renderHookWithSession(() => useGroupStats(), Wrapper);

    await waitFor(() => expect(rpcImpl).toHaveBeenCalled());
    expect(rpcImpl).toHaveBeenCalledWith("get_my_group_stats", {
      p_today: "2031-01-02",
    });
  });
});
