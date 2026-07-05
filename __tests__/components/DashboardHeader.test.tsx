import { render, fireEvent, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { Alert } from "react-native";

import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import { queryKeys } from "@/lib/queryKeys";
import { GroupResult, Member } from "@/types/dashboardTypes";

import { buildWrapper, makeQueryClient } from "../test-utils/render";

const stats: GroupResult = {
  group_id: "group-1",
  name: "Habit Crew",
  icon: "👥",
  current_streak: 7,
  invite_code: "ABC123",
  last_streak_date: null,
  groups: { last_streak_date: null, current_streak: 7 },
};

const members: Member[] = [
  {
    user_id: "user-1",
    full_name: "Me",
    goals: [
      {
        id: "g-1",
        title: "Run",
        user_id: "user-1",
        group_id: "group-1",
        completed_today: true,
        icon: null,
        repeat_days: [],
      },
      {
        id: "g-2",
        title: "Read",
        user_id: "user-1",
        group_id: "group-1",
        completed_today: false,
        icon: null,
        repeat_days: [],
      },
    ],
  },
];

function seed(queryClient: ReturnType<typeof makeQueryClient>) {
  queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
  queryClient.setQueryData(queryKeys.groupMembers("group-1"), members);
}

describe("DashboardHeader", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
    (Clipboard.setStringAsync as jest.Mock).mockClear();
  });

  it("renders group name, streak, member count and progress", async () => {
    const queryClient = makeQueryClient();
    seed(queryClient);
    const { Wrapper } = buildWrapper({ queryClient });

    const { findByText, getByText } = render(<DashboardHeader />, {
      wrapper: Wrapper,
    });

    expect(await findByText("Habit Crew")).toBeTruthy();
    expect(getByText("7d")).toBeTruthy();
    expect(getByText("1 of 2 done")).toBeTruthy();
    expect(getByText("50%")).toBeTruthy();
    // Single member, so the label should use the singular form.
    expect(getByText(/Group · 1 person/)).toBeTruthy();
  });

  it("copies the invite code on tap and alerts the user", async () => {
    const queryClient = makeQueryClient();
    seed(queryClient);
    const { Wrapper } = buildWrapper({ queryClient });

    const { getByText } = render(<DashboardHeader />, { wrapper: Wrapper });

    fireEvent.press(getByText("ABC123"));
    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith("ABC123");
      expect(Alert.alert).toHaveBeenCalledWith(
        "Copied",
        expect.stringContaining("ABC123"),
      );
    });
  });
});
