import { render, fireEvent, waitFor } from "@testing-library/react-native";

import EditGoalModal from "@/app/components/dashboard/EditGoalModal";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { Goal, GroupResult, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

const goal: Goal = {
  id: "g-1",
  title: "Run",
  user_id: "user-1",
  group_id: "group-1",
  completed_today: false,
  icon: "🏃",
  repeat_days: [0, 2, 4],
};

function seed(queryClient: ReturnType<typeof makeQueryClient>) {
  const stats: GroupResult = {
    group_id: "group-1",
    name: "G",
    icon: "👥",
    current_streak: 0,
    invite_code: "X",
    last_streak_date: null,
    groups: { last_streak_date: null, current_streak: 0 },
  };
  queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
  const members: Member[] = [
    { user_id: "user-1", full_name: "Me", goals: [goal] },
  ];
  queryClient.setQueryData(
    queryKeys.groupMembers("group-1", getTodayLocalDate()),
    members,
  );
}

function setup(goalOverride: Goal | null = goal) {
  const queryClient = makeQueryClient();
  seed(queryClient);
  const updateQB = makeQueryBuilder({ error: null });
  const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => updateQB) });
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  const onClose = jest.fn();
  const utils = render(
    <EditGoalModal goal={goalOverride} isVisible onClose={onClose} />,
    { wrapper: Wrapper },
  );
  return { ...utils, updateQB, onClose, queryClient };
}

describe("EditGoalModal", () => {
  // The create screen always carried this line; the edit sheet, a copy of the
  // same form, lost it.
  it("explains when the reminder fires, as the create screen does", () => {
    const { getByText } = setup();

    expect(getByText("Only if you haven't ticked it off yet.")).toBeTruthy();
  });

  it("prefills the title, icon and repeat days from the goal", () => {
    const { getByDisplayValue, getByLabelText } = setup();

    expect(getByDisplayValue("Run")).toBeTruthy();
    expect(getByLabelText("🏃").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Mon").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Wed").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Tue").props.accessibilityState.selected).toBe(false);
  });

  it("submits the new title and closes on save", async () => {
    const { getByDisplayValue, getByText, updateQB, onClose } = setup();

    fireEvent.changeText(getByDisplayValue("Run"), "Walk");
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(updateQB.update).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Walk" }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("saves a changed icon", async () => {
    const { getByLabelText, getByText, updateQB } = setup();

    fireEvent.press(getByLabelText("📚"));
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(updateQB.update).toHaveBeenCalledWith(
        expect.objectContaining({ icon: "📚" }),
      );
    });
  });

  it("saves changed repeat days, keeping them sorted", async () => {
    const { getByLabelText, getByText, updateQB } = setup();

    fireEvent.press(getByLabelText("Tue")); // add index 1
    fireEvent.press(getByLabelText("Mon")); // remove index 0
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(updateQB.update).toHaveBeenCalledWith(
        expect.objectContaining({ repeat_days: [1, 2, 4] }),
      );
    });
  });

  it("treats a goal with no repeat days as every day", () => {
    const { getByLabelText } = setup({ ...goal, repeat_days: [] });

    expect(getByLabelText("Mon").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Sun").props.accessibilityState.selected).toBe(true);
  });

  it("does not save an empty title", () => {
    const { getByDisplayValue, getByText, updateQB, onClose } = setup();

    fireEvent.changeText(getByDisplayValue("Run"), "   ");
    fireEvent.press(getByText("Save"));

    expect(updateQB.update).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Dashboard keeps the modal mounted and swaps `goal` (null while closed), so
  // these drive it the same way.
  it("shows a different habit's values when another one is opened", () => {
    const { getByDisplayValue, rerender, getByLabelText } = setup();
    const swim: Goal = { ...goal, id: "g-2", title: "Swim", repeat_days: [1] };

    rerender(
      <EditGoalModal goal={null} isVisible={false} onClose={jest.fn()} />,
    );
    rerender(<EditGoalModal goal={swim} isVisible onClose={jest.fn()} />);

    expect(getByDisplayValue("Swim")).toBeTruthy();
    expect(getByLabelText("Tue").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Mon").props.accessibilityState.selected).toBe(false);
  });

  it("reopens the same habit with its saved values, not abandoned edits", () => {
    const { getByDisplayValue, rerender, getByLabelText } = setup();

    fireEvent.changeText(getByDisplayValue("Run"), "Jog");
    fireEvent.press(getByLabelText("Tue"));
    rerender(
      <EditGoalModal goal={null} isVisible={false} onClose={jest.fn()} />,
    );
    rerender(<EditGoalModal goal={goal} isVisible onClose={jest.fn()} />);

    expect(getByDisplayValue("Run")).toBeTruthy();
    expect(getByLabelText("Tue").props.accessibilityState.selected).toBe(false);
  });

  describe("reminder", () => {
    it("shows the habit's reminder as on", () => {
      const { getByLabelText } = setup({ ...goal, reminder_time: "08:30" });
      expect(getByLabelText("Reminder").props.value).toBe(true);
    });

    it("shows a habit without one as off", () => {
      const { getByLabelText } = setup();
      expect(getByLabelText("Reminder").props.value).toBe(false);
    });

    it("saves a newly switched-on reminder", async () => {
      const { getByLabelText, getByText, updateQB } = setup();

      fireEvent(getByLabelText("Reminder"), "valueChange", true);
      fireEvent.press(getByText("Save"));

      await waitFor(() =>
        expect(updateQB.update).toHaveBeenCalledWith(
          expect.objectContaining({ reminder_time: "09:00" }),
        ),
      );
    });

    it("saves a switched-off reminder as null", async () => {
      const { getByLabelText, getByText, updateQB } = setup({
        ...goal,
        reminder_time: "08:30",
      });

      fireEvent(getByLabelText("Reminder"), "valueChange", false);
      fireEvent.press(getByText("Save"));

      await waitFor(() =>
        expect(updateQB.update).toHaveBeenCalledWith(
          expect.objectContaining({ reminder_time: null }),
        ),
      );
    });

    it("counts a reminder change as unsaved, so a backdrop tap won't drop it", () => {
      const { getByLabelText, queryByLabelText } = setup();
      expect(queryByLabelText("Close")).toBeTruthy();

      fireEvent(getByLabelText("Reminder"), "valueChange", true);

      expect(queryByLabelText("Close")).toBeNull();
    });
  });
});

// The tour opens the real edit sheet on a sample habit, so the save has to be
// replaceable: nothing a sample does may reach the server.
describe("EditGoalModal with its own onSave", () => {
  it("hands the edit to onSave instead of saving it", async () => {
    const queryClient = makeQueryClient();
    const fromImpl = jest.fn(() => makeQueryBuilder({ error: null }));
    const { Wrapper } = buildWrapper({
      supabase: buildFakeSupabase({ fromImpl }),
      queryClient,
    });
    const onSave = jest.fn(() => Promise.resolve());
    const onClose = jest.fn();
    const { getByDisplayValue, getByText } = render(
      <EditGoalModal goal={goal} isVisible onClose={onClose} onSave={onSave} />,
      { wrapper: Wrapper },
    );

    fireEvent.changeText(getByDisplayValue("Run"), "Walk");
    fireEvent.press(getByText("Save"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith("g-1", {
      title: "Walk",
      icon: "🏃",
      repeatDays: [0, 2, 4],
      reminderTime: null,
    });
    expect(fromImpl).not.toHaveBeenCalled();
  });
});
