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

async function setup(goalOverride: Goal | null = goal) {
  const queryClient = makeQueryClient();
  seed(queryClient);
  const updateQB = makeQueryBuilder({ error: null });
  const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => updateQB) });
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  const onClose = jest.fn();
  const utils = await render(
    <EditGoalModal goal={goalOverride} isVisible onClose={onClose} />,
    { wrapper: Wrapper },
  );
  return { ...utils, updateQB, onClose, queryClient };
}

describe("EditGoalModal", () => {
  // The create screen always carried this line; the edit sheet, a copy of the
  // same form, lost it.
  it("explains when the reminder fires, as the create screen does", async () => {
    const { getByText } = await setup();

    expect(getByText("Only if you haven't ticked it off yet.")).toBeTruthy();
  });

  it("prefills the title, icon and repeat days from the goal", async () => {
    const { getByDisplayValue, getByLabelText } = await setup();

    expect(getByDisplayValue("Run")).toBeTruthy();
    expect(getByLabelText("🏃").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Mon").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Wed").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Tue").props.accessibilityState.selected).toBe(false);
  });

  it("submits the new title and closes on save", async () => {
    const { getByDisplayValue, getByText, updateQB, onClose } = await setup();

    await fireEvent.changeText(getByDisplayValue("Run"), "Walk");
    await fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(updateQB.update).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Walk" }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("saves a changed icon", async () => {
    const { getByLabelText, getByText, updateQB } = await setup();

    await fireEvent.press(getByLabelText("📚"));
    await fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(updateQB.update).toHaveBeenCalledWith(
        expect.objectContaining({ icon: "📚" }),
      );
    });
  });

  it("saves changed repeat days, keeping them sorted", async () => {
    const { getByLabelText, getByText, updateQB } = await setup();

    await fireEvent.press(getByLabelText("Tue")); // add index 1
    await fireEvent.press(getByLabelText("Mon")); // remove index 0
    await fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(updateQB.update).toHaveBeenCalledWith(
        expect.objectContaining({ repeat_days: [1, 2, 4] }),
      );
    });
  });

  it("treats a goal with no repeat days as every day", async () => {
    const { getByLabelText } = await setup({ ...goal, repeat_days: [] });

    expect(getByLabelText("Mon").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Sun").props.accessibilityState.selected).toBe(true);
  });

  it("does not save an empty title", async () => {
    const { getByDisplayValue, getByText, updateQB, onClose } = await setup();

    await fireEvent.changeText(getByDisplayValue("Run"), "   ");
    await fireEvent.press(getByText("Save"));

    expect(updateQB.update).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Dashboard keeps the modal mounted and swaps `goal` (null while closed), so
  // these drive it the same way.
  it("shows a different habit's values when another one is opened", async () => {
    const { getByDisplayValue, rerender, getByLabelText } = await setup();
    const swim: Goal = { ...goal, id: "g-2", title: "Swim", repeat_days: [1] };

    await rerender(
      <EditGoalModal goal={null} isVisible={false} onClose={jest.fn()} />,
    );
    await rerender(<EditGoalModal goal={swim} isVisible onClose={jest.fn()} />);

    expect(getByDisplayValue("Swim")).toBeTruthy();
    expect(getByLabelText("Tue").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("Mon").props.accessibilityState.selected).toBe(false);
  });

  it("reopens the same habit with its saved values, not abandoned edits", async () => {
    const { getByDisplayValue, rerender, getByLabelText } = await setup();

    await fireEvent.changeText(getByDisplayValue("Run"), "Jog");
    await fireEvent.press(getByLabelText("Tue"));
    await rerender(
      <EditGoalModal goal={null} isVisible={false} onClose={jest.fn()} />,
    );
    await rerender(<EditGoalModal goal={goal} isVisible onClose={jest.fn()} />);

    expect(getByDisplayValue("Run")).toBeTruthy();
    expect(getByLabelText("Tue").props.accessibilityState.selected).toBe(false);
  });

  describe("reminder", () => {
    it("shows the habit's reminder as on", async () => {
      const { getByLabelText } = await setup({
        ...goal,
        reminder_time: "08:30",
      });
      expect(getByLabelText("Reminder").props.value).toBe(true);
    });

    it("shows a habit without one as off", async () => {
      const { getByLabelText } = await setup();
      expect(getByLabelText("Reminder").props.value).toBe(false);
    });

    it("saves a newly switched-on reminder", async () => {
      const { getByLabelText, getByText, updateQB } = await setup();

      await fireEvent(getByLabelText("Reminder"), "valueChange", true);
      await fireEvent.press(getByText("Save"));

      await waitFor(() =>
        expect(updateQB.update).toHaveBeenCalledWith(
          expect.objectContaining({ reminder_time: "09:00" }),
        ),
      );
    });

    it("saves a switched-off reminder as null", async () => {
      const { getByLabelText, getByText, updateQB } = await setup({
        ...goal,
        reminder_time: "08:30",
      });

      await fireEvent(getByLabelText("Reminder"), "valueChange", false);
      await fireEvent.press(getByText("Save"));

      await waitFor(() =>
        expect(updateQB.update).toHaveBeenCalledWith(
          expect.objectContaining({ reminder_time: null }),
        ),
      );
    });

    it("counts a reminder change as unsaved, so a backdrop tap won't drop it", async () => {
      const { getByLabelText, queryByLabelText } = await setup();
      expect(queryByLabelText("Close")).toBeTruthy();

      await fireEvent(getByLabelText("Reminder"), "valueChange", true);

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
    const { getByDisplayValue, getByText } = await render(
      <EditGoalModal goal={goal} isVisible onClose={onClose} onSave={onSave} />,
      { wrapper: Wrapper },
    );

    await fireEvent.changeText(getByDisplayValue("Run"), "Walk");
    await fireEvent.press(getByText("Save"));

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

describe("EditGoalModal title", () => {
  it("stops at 60 characters, the server's limit", async () => {
    const { getByDisplayValue } = await setup();
    expect(getByDisplayValue("Run").props.maxLength).toBe(60);
  });
});
