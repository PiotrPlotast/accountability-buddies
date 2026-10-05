import { AppState } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import Dashboard from "@/app/components/dashboard/Dashboard";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { Goal, GroupResult, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
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

const goal = (id: string, user_id: string): Goal => ({
  id,
  title: id,
  user_id,
  group_id: "group-1",
  completed_today: false,
  icon: null,
  repeat_days: [],
});

const me: Member = {
  user_id: "user-1",
  full_name: "Me Myself",
  goals: [goal("My habit", "user-1")],
};
const buddy: Member = {
  user_id: "user-2",
  full_name: "Buddy Pal",
  goals: [goal("Buddy habit", "user-2")],
};

function renderDashboard() {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
  queryClient.setQueryData(
    queryKeys.groupMembers("group-1", getTodayLocalDate()),
    [me, buddy],
  );
  // Named, so the dashboard's name gate is settled and reads nothing.
  queryClient.setQueryData(queryKeys.profile("user-1"), {
    full_name: "Me Myself",
    avatar_url: null,
  });
  const { Wrapper } = buildWrapper({
    supabase: buildFakeSupabase(),
    queryClient,
  });
  return { queryClient, ...render(<Dashboard />, { wrapper: Wrapper }) };
}

describe("Dashboard member tabs", () => {
  it("opens on your own tab", () => {
    const { getByText, queryByText } = renderDashboard();
    expect(getByText("My habit")).toBeTruthy();
    expect(queryByText("Buddy habit")).toBeNull();
  });

  it("shows the buddy's habits once their tab is picked", () => {
    const { getByLabelText, getByText } = renderDashboard();
    fireEvent.press(getByLabelText(/^Buddy Pal,/));
    expect(getByText("Buddy habit")).toBeTruthy();
  });

  // The viewed member leaving used to pin the skeleton on screen for good.
  it("falls back to your tab when the viewed member leaves", async () => {
    const { queryClient, getByLabelText, getByText, queryByTestId } =
      renderDashboard();
    fireEvent.press(getByLabelText(/^Buddy Pal,/));

    act(() => {
      queryClient.setQueryData(
        queryKeys.groupMembers("group-1", getTodayLocalDate()),
        [me],
      );
    });

    // The cache notifies its observers on the next tick.
    await waitFor(() => expect(getByText("My habit")).toBeTruthy());
    expect(queryByTestId("goal-list-skeleton")).toBeNull();
    expect(getByLabelText(/^You,/).props.accessibilityState).toEqual({
      selected: true,
    });
  });
});

describe("Dashboard across midnight", () => {
  const remove = jest.fn();

  beforeEach(() => {
    jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove } as never);
    // Monday 2026-10-05, half a minute before local midnight.
    jest.useFakeTimers({ now: new Date(2026, 9, 5, 23, 59, 30) });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  /** Offline: every read hangs, so only the cache can answer. */
  function hanging() {
    const qb = makeQueryBuilder({ data: null, error: null });
    (qb as unknown as { then: unknown }).then = () => new Promise(() => {});
    return qb;
  }

  it("switches to the new day's habits at midnight", async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
    queryClient.setQueryData(queryKeys.groupMembers("group-1", "2026-10-05"), [
      {
        ...me,
        goals: [
          { ...goal("Mondays only", "user-1"), repeat_days: [0] },
          { ...goal("Every day", "user-1"), completed_today: true },
        ],
      },
    ]);
    queryClient.setQueryData(queryKeys.profile("user-1"), {
      full_name: "Me Myself",
      avatar_url: null,
    });
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase({
        fromImpl: jest.fn(hanging),
        rpcImpl: jest.fn(hanging),
      }),
      queryClient,
    });
    const { getByText, queryByText } = render(<Dashboard />, {
      wrapper: Wrapper,
    });
    expect(getByText("Mondays only")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(queryByText("Mondays only")).toBeNull();
    expect(getByText("Every day")).toBeTruthy();
  });
});
