import { render, fireEvent, waitFor } from "@testing-library/react-native";

import DeleteGoalModal from "@/app/components/dashboard/DeleteGoalModal";
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
  repeat_days: [0, 1, 2, 3, 4, 5, 6],
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

describe("DeleteGoalModal", () => {
  it("renders the goal title in the confirmation", () => {
    const queryClient = makeQueryClient();
    seed(queryClient);
    const { Wrapper } = buildWrapper({ queryClient });
    const { getByText } = render(
      <DeleteGoalModal goal={goal} isVisible onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    expect(getByText('"Run" will be removed.')).toBeTruthy();
  });

  it("calls onClose when Cancel is pressed", () => {
    const queryClient = makeQueryClient();
    seed(queryClient);
    const { Wrapper } = buildWrapper({ queryClient });
    const onClose = jest.fn();
    const { getByText } = render(
      <DeleteGoalModal goal={goal} isVisible onClose={onClose} />,
      { wrapper: Wrapper },
    );
    fireEvent.press(getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("invokes the delete mutation and closes on success", async () => {
    const queryClient = makeQueryClient();
    seed(queryClient);
    const deleteQB = makeQueryBuilder({ data: { id: "g-1" }, error: null });
    const fromImpl = jest.fn(() => deleteQB);
    const supabase = buildFakeSupabase({ fromImpl });
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const onClose = jest.fn();

    const { getByText } = render(
      <DeleteGoalModal goal={goal} isVisible onClose={onClose} />,
      { wrapper: Wrapper },
    );
    fireEvent.press(getByText("Delete"));

    await waitFor(() => {
      expect(fromImpl).toHaveBeenCalledWith("goals");
      expect(onClose).toHaveBeenCalled();
    });
  });
});
