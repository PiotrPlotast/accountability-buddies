import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import GoalList from "@/app/components/dashboard/GoalList";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import Reanimated, { LayoutAnimationConfig } from "react-native-reanimated";

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

describe("GoalList swipe actions", () => {
  const buddyGoal = {
    id: "g-2",
    title: "Run",
    user_id: "user-2",
    group_id: "group-1",
    completed_today: false,
    icon: null,
    repeat_days: [],
  };

  function renderWithGoal(
    selectedTabId: string,
    handlers: { onNudge?: jest.Mock; onDelete?: jest.Mock },
  ) {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
    queryClient.setQueryData(
      queryKeys.groupMembers("group-1", getTodayLocalDate()),
      members,
    );
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase(),
      queryClient,
    });
    const utils = render(
      <GoalList
        selectedTabId={selectedTabId}
        goals={[{ ...buddyGoal, user_id: selectedTabId }]}
        onEdit={jest.fn()}
        onDelete={handlers.onDelete ?? jest.fn()}
        onNudge={handlers.onNudge}
      />,
      { wrapper: Wrapper },
    );
    const swipeable = utils.UNSAFE_getByProps({ friction: 2 });
    return { ...utils, swipeable };
  }

  // The swipe reveals what the right-hand action renders; render it directly
  // rather than simulating the gesture.
  const renderAction = (fn: unknown, close: jest.Mock = jest.fn()) =>
    render(
      (fn as (p: unknown, d: unknown, m: unknown) => React.ReactElement)(
        { value: 0 },
        { value: 0 },
        { close },
      ),
    );

  it("offers a nudge for a buddy's habit, carrying that habit", () => {
    const onNudge = jest.fn();
    const { swipeable } = renderWithGoal("user-2", { onNudge });
    expect(swipeable.props.renderLeftActions).toBeUndefined();

    const action = renderAction(swipeable.props.renderRightActions);
    fireEvent.press(action.getByText("Nudge"));
    expect(onNudge).toHaveBeenCalledWith(
      expect.objectContaining({ id: "g-2", title: "Run" }),
    );
  });

  // The row stays where it is under the nudge box, so it shouldn't sit there
  // swiped open once the box closes.
  it("closes the swiped row as it opens the nudge", () => {
    const close = jest.fn();
    const { swipeable } = renderWithGoal("user-2", { onNudge: jest.fn() });

    const action = renderAction(swipeable.props.renderRightActions, close);
    fireEvent.press(action.getByText("Nudge"));
    expect(close).toHaveBeenCalled();
  });

  it("keeps delete, not nudge, on your own habits", () => {
    const onNudge = jest.fn();
    const onDelete = jest.fn();
    const { swipeable } = renderWithGoal("user-1", { onNudge, onDelete });

    const action = renderAction(swipeable.props.renderRightActions);
    expect(action.queryByText("Nudge")).toBeNull();
    fireEvent.press(action.getByText("Delete"));
    expect(onDelete).toHaveBeenCalled();
    expect(onNudge).not.toHaveBeenCalled();
  });
});

// A swipe starts with a touch on the row, so the row's own press used to fire
// when the finger lifted and tick (or untick) the habit being swiped to edit or
// delete. The gesture itself can't run here; the Swipeable's drag callback is
// called directly, between the touch going down and coming up, the order the
// app sees them in.
describe("GoalList swipe versus tap", () => {
  const myGoal: Goal = {
    id: "g-1",
    title: "Read",
    user_id: "user-1",
    group_id: "group-1",
    completed_today: false,
    icon: null,
    repeat_days: [],
  };

  function renderMine() {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
    queryClient.setQueryData(
      queryKeys.groupMembers("group-1", getTodayLocalDate()),
      [{ user_id: "user-1", full_name: "Me", goals: [myGoal] }],
    );
    const fromImpl = jest.fn(() =>
      makeQueryBuilder({ data: null, error: null }),
    );
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase({ fromImpl }),
      queryClient,
    });
    const utils = render(
      <GoalList
        selectedTabId="user-1"
        goals={[myGoal]}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
      { wrapper: Wrapper },
    );
    const row = utils.getByRole("checkbox", { name: "Read" });
    const swipeable = utils.UNSAFE_getByProps({ friction: 2 });
    const logWrites = () =>
      fromImpl.mock.calls.filter((call: unknown[]) => call[0] === "logs");
    return { row, swipeable, logWrites };
  }

  // The toggle writes after awaiting a cache cancel, so let that run out.
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  it("ticks the habit on a plain tap", async () => {
    const { row, logWrites } = renderMine();

    fireEvent(row, "pressIn");
    fireEvent.press(row);
    await settle();

    expect(logWrites()).toHaveLength(1);
  });

  it.each([
    ["right, towards edit", "right"],
    ["left, towards delete", "left"],
  ])("does not tick the habit when swiped %s", async (_label, direction) => {
    const { row, swipeable, logWrites } = renderMine();

    fireEvent(row, "pressIn");
    act(() => swipeable.props.onSwipeableOpenStartDrag(direction));
    fireEvent.press(row);
    await settle();

    expect(logWrites()).toHaveLength(0);
  });

  it("does not tick the habit when dragged back closed", async () => {
    const { row, swipeable, logWrites } = renderMine();

    fireEvent(row, "pressIn");
    act(() => swipeable.props.onSwipeableCloseStartDrag("left"));
    fireEvent.press(row);
    await settle();

    expect(logWrites()).toHaveLength(0);
  });

  // The swipe is forgotten once the finger lifts: the next touch is a tap.
  it("ticks the habit on a tap after a swipe", async () => {
    const { row, swipeable, logWrites } = renderMine();

    fireEvent(row, "pressIn");
    act(() => swipeable.props.onSwipeableOpenStartDrag("right"));
    fireEvent.press(row);

    fireEvent(row, "pressIn");
    fireEvent.press(row);
    await settle();

    expect(logWrites()).toHaveLength(1);
  });
});

// Rows that are there when the list first mounts appear still; rows added
// afterwards (an optimistic insert) fade in. Reanimated's own
// `LayoutAnimationConfig skipEntering` does the first half, so the list has to
// stay inside one for its whole life, skeleton and empty state included.
describe("GoalList first paint", () => {
  const habit = (id: string): Goal => ({
    id,
    title: id,
    user_id: "user-1",
    group_id: "group-1",
    completed_today: false,
    icon: null,
    repeat_days: [],
  });

  function renderLive(goals: Goal[], opts: { seed: boolean }) {
    const queryClient = makeQueryClient();
    if (opts.seed) {
      queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
      queryClient.setQueryData(
        queryKeys.groupMembers("group-1", getTodayLocalDate()),
        members,
      );
    }
    const rpcImpl = jest.fn(() => ({
      maybeSingle: () => new Promise(() => {}),
    }));
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase({ rpcImpl }),
      queryClient,
    });
    const list = (g: Goal[]) => (
      <GoalList
        selectedTabId="user-1"
        goals={g}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    const utils = render(list(goals), { wrapper: Wrapper });
    return {
      ...utils,
      queryClient,
      rerenderWith: (g: Goal[]) => utils.rerender(list(g)),
    };
  }

  it("skips the entering fade for the rows on screen when it mounts", () => {
    const { UNSAFE_getByType } = renderLive([habit("Run")], { seed: true });

    expect(UNSAFE_getByType(LayoutAnimationConfig).props.skipEntering).toBe(
      true,
    );
  });

  it("gives every row an entering fade for rows added later", () => {
    const { UNSAFE_queryAllByType, rerenderWith } = renderLive([habit("Run")], {
      seed: true,
    });

    rerenderWith([habit("Run"), habit("Swim")]);

    const rows = UNSAFE_queryAllByType(Reanimated.View).filter(
      (view) => view.props.exiting !== undefined,
    );
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.props.entering).toBeDefined());
  });

  it("keeps one config mounted from the empty state to the first habit", () => {
    const { UNSAFE_getByType, rerenderWith } = renderLive([], { seed: true });
    const before = UNSAFE_getByType(LayoutAnimationConfig);

    rerenderWith([habit("Run")]);

    expect(UNSAFE_getByType(LayoutAnimationConfig)).toBe(before);
  });

  it("wraps the skeleton too, so rows that land after loading still fade in", () => {
    const { UNSAFE_getByType, getByTestId } = renderLive([], { seed: false });

    expect(getByTestId("goal-list-skeleton")).toBeTruthy();
    expect(UNSAFE_getByType(LayoutAnimationConfig)).toBeTruthy();
  });
});
