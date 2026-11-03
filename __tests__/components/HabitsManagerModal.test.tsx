import { render, fireEvent } from "@testing-library/react-native";

import HabitManagerModal from "@/app/components/dashboard/HabitsManagerModal";
import { formatReminderTime } from "@/lib/reminderTime";
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

async function renderModal(
  props: Partial<React.ComponentProps<typeof HabitManagerModal>> = {},
) {
  const { Wrapper } = buildWrapper();
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  const onClose = jest.fn();
  const utils = await render(
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
  it("reports the edit request immediately, without a timer", async () => {
    jest.useFakeTimers();
    try {
      const { getByLabelText, onEdit, onClose } = await renderModal();

      // Watched from the press on: RNTL 14's async render leaves timers of
      // its own behind, so a count of all pending timers says nothing here.
      const setTimer = jest.spyOn(globalThis, "setTimeout");
      await fireEvent.press(getByLabelText("Edit Run"));

      // The old implementation closed first and fired onEdit from a 400ms
      // setTimeout; the request must now be synchronous so the dashboard can
      // sequence the modals itself.
      expect(onEdit).toHaveBeenCalledWith(goal);
      expect(onClose).not.toHaveBeenCalled();
      expect(setTimer).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("reports the delete request immediately", async () => {
    const { getByLabelText, onDelete } = await renderModal();

    await fireEvent.press(getByLabelText("Delete Run"));

    expect(onDelete).toHaveBeenCalledWith(goal);
  });

  it("renders the habit's repeat days on the stored Monday=0 scale", async () => {
    const { getByText } = await renderModal();
    expect(getByText("Mon, Wed, Fri")).toBeTruthy();
  });

  it("adds the reminder time after the repeat days", async () => {
    const { getByText } = await renderModal({
      goals: [{ ...goal, reminder_time: "08:00" }],
    });
    expect(
      getByText(`Mon, Wed, Fri · ${formatReminderTime("08:00")}`),
    ).toBeTruthy();
  });

  it("hides the edit and delete actions when viewing someone else", async () => {
    const { queryByLabelText } = await renderModal({ isViewingMe: false });
    expect(queryByLabelText("Edit Run")).toBeNull();
    expect(queryByLabelText("Delete Run")).toBeNull();
  });
});
