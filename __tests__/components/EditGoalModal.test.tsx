import { render, fireEvent, waitFor } from "@testing-library/react-native";

import EditGoalModal from "@/app/components/dashboard/EditGoalModal";
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
  queryClient.setQueryData(queryKeys.groupMembers("group-1"), members);
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
});
