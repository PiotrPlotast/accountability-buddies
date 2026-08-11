import { render, fireEvent } from "@testing-library/react-native";

import HabitManagerModal from "@/app/components/dashboard/HabitsManagerModal";
import { Goal } from "@/types/dashboardTypes";

import { buildWrapper } from "../test-utils/render";

const goal: Goal = {
  id: "g-1",
  title: "Run",
  user_id: "user-1",
  group_id: "group-1",
  completed_today: false,
  icon: "🏃",
  repeat_days: [0, 2, 4],
};

function renderModal(
  props: Partial<React.ComponentProps<typeof HabitManagerModal>> = {},
) {
  const { Wrapper } = buildWrapper();
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <HabitManagerModal
      isVisible
      onClose={onClose}
      goals={[goal]}
      isViewingMe
      onEdit={onEdit}
      onDelete={onDelete}
      {...props}
    />,
    { wrapper: Wrapper },
  );
  return { ...utils, onEdit, onDelete, onClose };
}

describe("HabitManagerModal", () => {
  it("reports the edit request immediately, without a timer", () => {
    jest.useFakeTimers();
    try {
      const { getByLabelText, onEdit, onClose } = renderModal();

      fireEvent.press(getByLabelText("Edit Run"));

      // The old implementation closed first and fired onEdit from a 400ms
      // setTimeout; the request must now be synchronous so the dashboard can
      // sequence the modals itself.
      expect(onEdit).toHaveBeenCalledWith(goal);
      expect(onClose).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("reports the delete request immediately", () => {
    const { getByLabelText, onDelete } = renderModal();

    fireEvent.press(getByLabelText("Delete Run"));

    expect(onDelete).toHaveBeenCalledWith(goal);
  });

  it("renders the habit's repeat days on the stored Monday=0 scale", () => {
    const { getByText } = renderModal();
    expect(getByText("Mon, Wed, Fri")).toBeTruthy();
  });

  it("hides the edit and delete actions when viewing someone else", () => {
    const { queryByLabelText } = renderModal({ isViewingMe: false });
    expect(queryByLabelText("Edit Run")).toBeNull();
    expect(queryByLabelText("Delete Run")).toBeNull();
  });
});
