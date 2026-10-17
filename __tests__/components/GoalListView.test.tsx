import { fireEvent, render } from "@testing-library/react-native";

import { GoalListView } from "@/app/components/dashboard/GoalList";
import { Goal } from "@/types/dashboardTypes";

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

function renderView(props: Partial<Parameters<typeof GoalListView>[0]> = {}) {
  const handlers = {
    onToggle: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
  };
  const utils = render(
    <GoalListView
      goals={[goal]}
      loading={false}
      canEdit
      {...handlers}
      {...props}
    />,
  );
  return { ...utils, ...handlers };
}

describe("GoalListView", () => {
  it("hands a tapped habit to onToggle", () => {
    const { getByLabelText, onToggle } = renderView();

    fireEvent.press(getByLabelText("Read"));

    expect(onToggle).toHaveBeenCalledWith(goal);
  });

  it("does not toggle someone else's habits", () => {
    const { getByLabelText, onToggle } = renderView({ canEdit: false });

    fireEvent.press(getByLabelText("Read"));

    expect(onToggle).not.toHaveBeenCalled();
    expect(getByLabelText("Read").props.accessibilityState.disabled).toBe(true);
  });

  it("shows the skeleton while loading", () => {
    const { getByTestId } = renderView({ loading: true });

    expect(getByTestId("goal-list-skeleton")).toBeTruthy();
  });
});
