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
  icon: null,
  repeat_days: [],
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

describe("EditGoalModal", () => {
  it("prefills the input with the goal's current title", () => {
    const queryClient = makeQueryClient();
    seed(queryClient);
    const { Wrapper } = buildWrapper({ queryClient });

    const { getByDisplayValue } = render(
      <EditGoalModal goal={goal} isVisible onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    expect(getByDisplayValue("Run")).toBeTruthy();
  });

  it("submits the new title and closes on save", async () => {
    const queryClient = makeQueryClient();
    seed(queryClient);
    const updateQB = makeQueryBuilder({ error: null });
    const fromImpl = jest.fn(() => updateQB);
    const supabase = buildFakeSupabase({ fromImpl });
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const onClose = jest.fn();

    const { getByDisplayValue, getByText } = render(
      <EditGoalModal goal={goal} isVisible onClose={onClose} />,
      { wrapper: Wrapper },
    );

    fireEvent.changeText(getByDisplayValue("Run"), "Walk");
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(updateQB.update).toHaveBeenCalledWith({ title: "Walk" });
      expect(onClose).toHaveBeenCalled();
    });
  });
});
