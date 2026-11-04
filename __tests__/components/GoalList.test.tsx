import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import GoalList from "@/app/components/dashboard/GoalList";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";

import { Goal, GroupResult, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";
import { swipeableClose } from "../test-utils/swipeableStub";

// The swipe can't run under Jest: the stand-in draws each row's actions as
// they look swiped open, and takes the drag callbacks as events.
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () =>
  require("../test-utils/swipeableStub"),
);

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

async function renderList(
  selectedTabId: string | null,
  opts: { seed: boolean },
) {
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
  return await render(
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
  it("shows the skeleton while the group is loading", async () => {
    const { getByTestId } = await renderList("user-1", { seed: false });
    expect(getByTestId("goal-list-skeleton")).toBeTruthy();
  });

  // A selected member missing from a loaded list is not "loading" — it used
  // to pin the skeleton on screen for good once the viewed member left.
  it("does not show the skeleton for a member missing from a loaded list", async () => {
    const { queryByTestId, getByText } = await renderList("gone", {
      seed: true,
    });
    expect(queryByTestId("goal-list-skeleton")).toBeNull();
    expect(getByText("Nothing here for today.")).toBeTruthy();
  });

  it("shows the empty state for your own empty day", async () => {
    const { queryByTestId, getByText } = await renderList("user-1", {
      seed: true,
    });
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

  async function renderWithGoal(
    selectedTabId: string,
    handlers: {
      onNudge?: jest.Mock;
      onDelete?: jest.Mock;
      onCheer?: jest.Mock;
    },
    done = false,
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
    const utils = await render(
      <GoalList
        selectedTabId={selectedTabId}
        goals={[
          { ...buddyGoal, user_id: selectedTabId, completed_today: done },
        ]}
        onEdit={jest.fn()}
        onDelete={handlers.onDelete ?? jest.fn()}
        onNudge={handlers.onNudge}
        onCheer={handlers.onCheer}
      />,
      { wrapper: Wrapper },
    );
    return utils;
  }

  beforeEach(() => swipeableClose.mockClear());

  it("offers a nudge for a buddy's habit, carrying that habit", async () => {
    const onNudge = jest.fn();
    const { queryByTestId, getByLabelText } = await renderWithGoal("user-2", {
      onNudge,
    });
    expect(queryByTestId("swipe-left-actions")).toBeNull();

    await fireEvent.press(getByLabelText("Nudge"));
    expect(onNudge).toHaveBeenCalledWith(
      expect.objectContaining({ id: "g-2", title: "Run" }),
    );
  });

  // The row stays where it is under the nudge box, so it shouldn't sit there
  // swiped open once the box closes.
  it("closes the swiped row as it opens the nudge", async () => {
    const { getByLabelText } = await renderWithGoal("user-2", {
      onNudge: jest.fn(),
    });

    await fireEvent.press(getByLabelText("Nudge"));
    expect(swipeableClose).toHaveBeenCalled();
  });

  // A ticked habit is something to cheer, not to nudge about.
  it("offers a cheer instead of a nudge for a buddy's ticked habit", async () => {
    const onNudge = jest.fn();
    const onCheer = jest.fn();
    const { queryByLabelText, getByLabelText } = await renderWithGoal(
      "user-2",
      { onNudge, onCheer },
      true,
    );

    expect(queryByLabelText("Nudge")).toBeNull();
    await fireEvent.press(getByLabelText("Cheer"));
    expect(onCheer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "g-2", title: "Run" }),
    );
    expect(onNudge).not.toHaveBeenCalled();
    expect(swipeableClose).toHaveBeenCalled();
  });

  it("offers no swipe on a ticked habit when cheering isn't available", async () => {
    const { queryByTestId } = await renderWithGoal(
      "user-2",
      { onNudge: jest.fn() },
      true,
    );
    expect(queryByTestId("swipe-right-actions")).toBeNull();
  });

  it("keeps delete, not nudge, on your own habits", async () => {
    const onNudge = jest.fn();
    const onDelete = jest.fn();
    const { queryByLabelText, getByLabelText } = await renderWithGoal(
      "user-1",
      { onNudge, onDelete },
    );

    expect(queryByLabelText("Nudge")).toBeNull();
    await fireEvent.press(getByLabelText("Delete"));
    expect(onDelete).toHaveBeenCalled();
    expect(onNudge).not.toHaveBeenCalled();
  });
});

// A swipe starts with a touch on the row, so the row's own press used to fire
// when the finger lifted and tick (or untick) the habit being swiped to edit or
// delete. The gesture itself can't run here; the swipe stand-in takes the
// drag as an event, fired between the touch going down and coming up, the
// order the app sees them in.
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

  async function renderMine() {
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
    const utils = await render(
      <GoalList
        selectedTabId="user-1"
        goals={[myGoal]}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
      { wrapper: Wrapper },
    );
    const row = utils.getByRole("checkbox", { name: "Read" });
    const swipeable = utils.getByTestId("swipeable-row");
    const logWrites = () =>
      fromImpl.mock.calls.filter((call: unknown[]) => call[0] === "logs");
    return { row, swipeable, logWrites };
  }

  // The toggle writes after awaiting a cache cancel, so let that run out.
  const settle = async () =>
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  it("ticks the habit on a plain tap", async () => {
    const { row, logWrites } = await renderMine();

    await fireEvent(row, "pressIn");
    await fireEvent.press(row);
    await settle();

    expect(logWrites()).toHaveLength(1);
  });

  it.each([
    ["right, towards edit", "right"],
    ["left, towards delete", "left"],
  ])("does not tick the habit when swiped %s", async (_label, direction) => {
    const { row, swipeable, logWrites } = await renderMine();

    await fireEvent(row, "pressIn");
    await fireEvent(swipeable, "swipeableOpenStartDrag", direction);
    await fireEvent.press(row);
    await settle();

    expect(logWrites()).toHaveLength(0);
  });

  it("does not tick the habit when dragged back closed", async () => {
    const { row, swipeable, logWrites } = await renderMine();

    await fireEvent(row, "pressIn");
    await fireEvent(swipeable, "swipeableCloseStartDrag", "left");
    await fireEvent.press(row);
    await settle();

    expect(logWrites()).toHaveLength(0);
  });

  // The swipe is forgotten once the finger lifts: the next touch is a tap.
  it("ticks the habit on a tap after a swipe", async () => {
    const { row, swipeable, logWrites } = await renderMine();

    await fireEvent(row, "pressIn");
    await fireEvent(swipeable, "swipeableOpenStartDrag", "right");
    await fireEvent.press(row);

    await fireEvent(row, "pressIn");
    await fireEvent.press(row);
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

  async function renderLive(goals: Goal[], opts: { seed: boolean }) {
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
    const utils = await render(list(goals), { wrapper: Wrapper });
    return {
      ...utils,
      queryClient,
      rerenderWith: async (g: Goal[]) => await utils.rerender(list(g)),
    };
  }

  it("skips the entering fade for the rows on screen when it mounts", async () => {
    const { getByTestId } = await renderLive([habit("Run")], {
      seed: true,
    });

    expect(getByTestId("layout-animation-config").props.skipEntering).toBe(
      true,
    );
  });

  it("gives every row an entering fade for rows added later", async () => {
    const { container, rerenderWith } = await renderLive([habit("Run")], {
      seed: true,
    });

    await rerenderWith([habit("Run"), habit("Swim")]);

    // A row is the animated view with an exit (the native View under
    // Reanimated.View keeps its props).
    const rows = container.queryAll((view) => view.props.exiting !== undefined);
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.props.entering).toBeDefined());
  });

  it("keeps one config mounted from the empty state to the first habit", async () => {
    const { getByTestId, rerenderWith } = await renderLive([], {
      seed: true,
    });
    const before = getByTestId("layout-animation-config");

    await rerenderWith([habit("Run")]);

    expect(getByTestId("layout-animation-config")).toBe(before);
  });

  it("wraps the skeleton too, so rows that land after loading still fade in", async () => {
    const { getByTestId } = await renderLive([], {
      seed: false,
    });

    expect(getByTestId("goal-list-skeleton")).toBeTruthy();
    expect(getByTestId("layout-animation-config")).toBeTruthy();
  });
});
