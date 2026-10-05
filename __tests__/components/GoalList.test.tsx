import { render } from "@testing-library/react-native";

import GoalList from "@/app/components/dashboard/GoalList";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { GroupResult, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryClient,
} from "../test-utils/render";

const stats: GroupResult = {
  group_id: "group-1",
  name: "Habit Crew",
  icon: "👥",
  current_streak: 0,
  invite_code: "ABCDEF0123",
  last_streak_date: null,
  groups: { last_streak_date: null, current_streak: 0 },
};

const members: Member[] = [{ user_id: "user-1", full_name: "Me", goals: [] }];

function renderList(selectedTabId: string | null, opts: { seed: boolean }) {
  const queryClient = makeQueryClient();
  if (opts.seed) {
    queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
    queryClient.setQueryData(
      queryKeys.groupMembers("group-1", getTodayLocalDate()),
      members,
    );
  }
  // A stats read that never settles, so the unseeded case stays loading.
  const rpcImpl = jest.fn(() => ({ maybeSingle: () => new Promise(() => {}) }));
  const { Wrapper } = buildWrapper({
    supabase: buildFakeSupabase({ rpcImpl }),
    queryClient,
  });
  return render(
    <GoalList
      selectedTabId={selectedTabId}
      goals={[]}
      onEdit={jest.fn()}
      onDelete={jest.fn()}
    />,
    { wrapper: Wrapper },
  );
}

describe("GoalList skeleton", () => {
  it("shows the skeleton while the group is loading", () => {
    const { getByTestId } = renderList("user-1", { seed: false });
    expect(getByTestId("goal-list-skeleton")).toBeTruthy();
  });

  // A selected member missing from a loaded list is not "loading" — it used
  // to pin the skeleton on screen for good once the viewed member left.
  it("does not show the skeleton for a member missing from a loaded list", () => {
    const { queryByTestId, getByText } = renderList("gone", { seed: true });
    expect(queryByTestId("goal-list-skeleton")).toBeNull();
    expect(getByText("Nothing here for today.")).toBeTruthy();
  });

  it("shows the empty state for your own empty day", () => {
    const { queryByTestId, getByText } = renderList("user-1", { seed: true });
    expect(queryByTestId("goal-list-skeleton")).toBeNull();
    expect(getByText(/No habits for today/)).toBeTruthy();
  });
});
