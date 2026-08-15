import { render, fireEvent } from "@testing-library/react-native";

import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import { queryKeys } from "@/lib/queryKeys";
import { Goal, GroupResult, Member } from "@/types/dashboardTypes";

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

const goal = (id: string, completed: boolean): Goal => ({
  id,
  title: id,
  user_id: "user-1",
  group_id: "group-1",
  completed_today: completed,
  icon: null,
  repeat_days: [],
});

const todayGoals = [goal("g-1", true), goal("g-2", false)];

const members: Member[] = [
  { user_id: "user-1", full_name: "Me", goals: todayGoals },
];

function renderHeader(overrides?: {
  todayGoals?: Goal[];
  onOpenHabitManager?: () => void;
  seedStats?: boolean;
}) {
  const queryClient = makeQueryClient();
  if (overrides?.seedStats !== false) {
    queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
  }
  queryClient.setQueryData(queryKeys.groupMembers("group-1"), members);
  const { Wrapper } = buildWrapper({ queryClient });

  return render(
    <DashboardHeader
      todayGoals={overrides?.todayGoals ?? todayGoals}
      onOpenHabitManager={overrides?.onOpenHabitManager ?? jest.fn()}
    />,
    { wrapper: Wrapper },
  );
}

describe("DashboardHeader", () => {
  it("renders group name, member count and today's progress", async () => {
    const { findByText, getByText } = renderHeader();

    expect(await findByText("Habit Crew")).toBeTruthy();
    expect(getByText("1 of 2 done")).toBeTruthy();
    expect(getByText("50%")).toBeTruthy();
    // Single member, so the label should use the singular form.
    expect(getByText(/Group · 1 person/)).toBeTruthy();
  });

  it("derives progress from the goals it is handed, not the cache", () => {
    const { getByText } = renderHeader({
      todayGoals: [goal("a", true), goal("b", true), goal("c", true)],
    });

    expect(getByText("3 of 3 done")).toBeTruthy();
    expect(getByText("100%")).toBeTruthy();
  });

  it("shows a placeholder until the group arrives", () => {
    const { getByText } = renderHeader({ seedStats: false });
    expect(getByText("Loading...")).toBeTruthy();
  });

  it("opens the habit manager when Habits is pressed", () => {
    const onOpenHabitManager = jest.fn();
    const { getByLabelText } = renderHeader({ onOpenHabitManager });

    fireEvent.press(getByLabelText("Habits"));
    expect(onOpenHabitManager).toHaveBeenCalledTimes(1);
  });

  describe("accessibility", () => {
    it("announces the streak as a phrase, not a flame and a number", async () => {
      const { findByLabelText } = renderHeader();
      expect(await findByLabelText("Group streak: 7 days")).toBeTruthy();
    });

    it("singularises a one-day streak", async () => {
      const queryClient = makeQueryClient();
      queryClient.setQueryData(queryKeys.groupStats("user-1"), {
        ...stats,
        current_streak: 1,
      });
      queryClient.setQueryData(queryKeys.groupMembers("group-1"), members);
      const { Wrapper } = buildWrapper({ queryClient });

      const { findByLabelText } = render(
        <DashboardHeader
          todayGoals={todayGoals}
          onOpenHabitManager={jest.fn()}
        />,
        { wrapper: Wrapper },
      );

      expect(await findByLabelText("Group streak: 1 day")).toBeTruthy();
    });

    it("exposes the group name as a button into settings", async () => {
      const { findByLabelText } = renderHeader();
      const button = await findByLabelText("Habit Crew");

      expect(button.props.accessibilityRole).toBe("button");
      expect(button.props.accessibilityHint).toBe("Opens group settings");
    });

    it("reports progress on the ring itself", async () => {
      const { findByLabelText } = renderHeader();
      const ring = await findByLabelText("Today's progress");

      expect(ring.props.accessibilityRole).toBe("progressbar");
      expect(ring.props.accessibilityValue).toMatchObject({ now: 50 });
    });
  });
});
