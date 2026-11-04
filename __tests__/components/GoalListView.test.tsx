import { fireEvent, render } from "@testing-library/react-native";

import { GoalListView } from "@/app/components/dashboard/GoalList";
import { Goal } from "@/types/dashboardTypes";

import { GestureRoot } from "../test-utils/render";

// The habit rows without the group behind them: what the tour drives with
// sample habits. `GoalList` is this plus the reads and the toggle mutation.
const goal: Goal = {
  id: "g-1",
  title: "Read",
  user_id: "me",
  group_id: "group-1",
  completed_today: false,
  icon: "📚",
  repeat_days: [],
};

async function renderView(
  props: Partial<Parameters<typeof GoalListView>[0]> = {},
) {
  const handlers = {
    onToggle: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
  };
  const utils = await render(
    <GoalListView
      goals={[goal]}
      loading={false}
      canEdit
      {...handlers}
      {...props}
    />,
    { wrapper: GestureRoot },
  );
  return { ...utils, ...handlers };
}

describe("GoalListView", () => {
  it("hands a tapped habit to onToggle", async () => {
    const { getByLabelText, onToggle } = await renderView();

    await fireEvent.press(getByLabelText("Read"));

    expect(onToggle).toHaveBeenCalledWith(goal);
  });

  it("does not toggle someone else's habits", async () => {
    const { getByLabelText, onToggle } = await renderView({ canEdit: false });

    await fireEvent.press(getByLabelText("Read"));

    expect(onToggle).not.toHaveBeenCalled();
    expect(getByLabelText("Read").props.accessibilityState.disabled).toBe(true);
  });

  it("shows the skeleton while loading", async () => {
    const { getByTestId } = await renderView({ loading: true });

    expect(getByTestId("goal-list-skeleton")).toBeTruthy();
  });
});
