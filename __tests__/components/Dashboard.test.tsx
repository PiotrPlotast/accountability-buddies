import { AppState, Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import Dashboard from "@/app/components/dashboard/Dashboard";
import DeleteGoalModal from "@/app/components/dashboard/DeleteGoalModal";
import EditGoalModal from "@/app/components/dashboard/EditGoalModal";
import HabitManagerModal from "@/app/components/dashboard/HabitsManagerModal";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { Goal, GroupResult, Member } from "@/types/dashboardTypes";
import * as haptics from "@/lib/haptics";

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

describe("Dashboard nudges", () => {
  beforeEach(() => {
    jest.spyOn(haptics, "celebrate").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("offers no nudge on your own tab", () => {
    const { queryByText } = renderDashboard();
    expect(queryByText(/^Nudge /)).toBeNull();
  });

  it("shows a nudge button on a buddy's tab, where your add-habit button sits", () => {
    const { getByLabelText, getByText, queryByText } = renderDashboard();
    fireEvent.press(getByLabelText(/^Buddy Pal,/));
    expect(getByText("Nudge Buddy")).toBeTruthy();
    expect(queryByText("Add a new habit")).toBeNull();
  });

  it("opens an empty nudge box from the button", () => {
    const { getByLabelText, getByText, queryByLabelText } = renderDashboard();
    fireEvent.press(getByLabelText(/^Buddy Pal,/));
    expect(queryByLabelText("Nudge message")).toBeNull();

    fireEvent.press(getByText("Nudge Buddy"));
    expect(getByLabelText("Nudge message").props.value).toBe("");
  });

  it("opens the box prefilled with the habit from a swipe", () => {
    const { getByLabelText, UNSAFE_getByProps } = renderDashboard();
    fireEvent.press(getByLabelText(/^Buddy Pal,/));

    const swipeable = UNSAFE_getByProps({ friction: 2 });
    const action = render(
      swipeable.props.renderRightActions({ value: 0 }, { value: 0 }),
    );
    act(() => {
      fireEvent.press(action.getByText("Nudge"));
    });

    expect(getByLabelText("Nudge message").props.value).toBe(
      "Buddy, what about your buddy habit?",
    );
  });

  it("confirms under the button after a send, for a few seconds", async () => {
    jest.useFakeTimers();
    const { getByLabelText, getByText, queryByText } = renderDashboard();
    fireEvent.press(getByLabelText(/^Buddy Pal,/));
    fireEvent.press(getByText("Nudge Buddy"));

    await act(async () => {
      fireEvent.press(getByText("Send"));
    });

    await waitFor(() => expect(getByText("Nudge sent to Buddy")).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(queryByText("Nudge sent to Buddy")).toBeNull();
  });
});

// The habit manager hands edit/delete to the dashboard, which opens them only
// once the manager's sheet is gone: on iOS from its `onDismiss`, elsewhere as
// soon as the manager closes.
describe("Dashboard habit manager hand-off", () => {
  const openFromManager = (
    utils: ReturnType<typeof renderDashboard>,
    label: string,
  ) => {
    fireEvent.press(utils.getByLabelText("Habits"));
    fireEvent.press(utils.getByLabelText(label));
  };

  it("on iOS, waits for the manager to finish dismissing before opening edit", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const utils = renderDashboard();

    openFromManager(utils, "Edit My habit");

    expect(utils.UNSAFE_getByType(HabitManagerModal).props.isVisible).toBe(
      false,
    );
    expect(utils.UNSAFE_getByType(EditGoalModal).props.isVisible).toBe(false);

    act(() => utils.UNSAFE_getByType(HabitManagerModal).props.onDismiss());

    const edit = utils.UNSAFE_getByType(EditGoalModal);
    expect(edit.props.isVisible).toBe(true);
    expect(edit.props.goal.id).toBe("My habit");
  });

  it("on Android, opens edit as the manager closes", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const utils = renderDashboard();

    openFromManager(utils, "Edit My habit");

    expect(utils.UNSAFE_getByType(HabitManagerModal).props.isVisible).toBe(
      false,
    );
    const edit = utils.UNSAFE_getByType(EditGoalModal);
    expect(edit.props.isVisible).toBe(true);
    expect(edit.props.goal.id).toBe("My habit");
  });

  it("on Android, opens delete as the manager closes", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const utils = renderDashboard();

    openFromManager(utils, "Delete My habit");

    const del = utils.UNSAFE_getByType(DeleteGoalModal);
    expect(del.props.isVisible).toBe(true);
    expect(del.props.goal.id).toBe("My habit");
    expect(utils.UNSAFE_getByType(EditGoalModal).props.isVisible).toBe(false);
  });

  it("opens nothing when the manager is closed without a request", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const utils = renderDashboard();

    fireEvent.press(utils.getByLabelText("Habits"));
    act(() => utils.UNSAFE_getByType(HabitManagerModal).props.onClose());
    act(() => utils.UNSAFE_getByType(HabitManagerModal).props.onDismiss());

    expect(utils.UNSAFE_getByType(EditGoalModal).props.isVisible).toBe(false);
    expect(utils.UNSAFE_getByType(DeleteGoalModal).props.isVisible).toBe(false);
  });
});
