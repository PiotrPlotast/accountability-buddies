import { fireEvent, render, waitFor } from "@testing-library/react-native";

import NewHabitScreen from "@/app/(protected)/new-habit";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { GroupResult } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

const stats: GroupResult = {
  group_id: "group-1",
  name: "G",
  icon: "👥",
  current_streak: 0,
  invite_code: "X",
  last_streak_date: null,
  groups: { last_streak_date: null, current_streak: 0 },
};

function setup() {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
  queryClient.setQueryData(
    queryKeys.groupMembers("group-1", getTodayLocalDate()),
    [{ user_id: "user-1", full_name: "Me", goals: [] }],
  );
  const insertQB = makeQueryBuilder({
    data: { id: "g-1", title: "Run" },
    error: null,
  });
  const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => insertQB) });
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  const utils = render(<NewHabitScreen />, { wrapper: Wrapper });
  fireEvent.changeText(
    utils.getByPlaceholderText("Meditate 10 minutes"),
    "Run",
  );
  return { ...utils, insertQB };
}

describe("New habit reminder", () => {
  it("starts with no reminder and creates the habit without one", async () => {
    const { getByLabelText, getByText, insertQB } = setup();
    expect(getByLabelText("Reminder").props.value).toBe(false);

    fireEvent.press(getByText("Create habit"));

    await waitFor(() => expect(insertQB.insert).toHaveBeenCalled());
    expect(insertQB.insert.mock.calls[0][0]).not.toHaveProperty(
      "reminder_time",
    );
  });

  it("creates the habit with the reminder that was switched on", async () => {
    const { getByLabelText, getByText, insertQB } = setup();

    fireEvent(getByLabelText("Reminder"), "valueChange", true);
    fireEvent.press(getByText("Create habit"));

    await waitFor(() =>
      expect(insertQB.insert).toHaveBeenCalledWith(
        expect.objectContaining({ reminder_time: "09:00" }),
      ),
    );
  });
});
