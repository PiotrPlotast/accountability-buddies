import { render, fireEvent } from "@testing-library/react-native";

import MemberTabs from "@/app/components/dashboard/MemberTabs";
import { Goal, Member } from "@/types/dashboardTypes";

const goal = (id: string, completed: boolean): Goal => ({
  id,
  title: "g",
  user_id: "any",
  group_id: "g1",
  completed_today: completed,
  icon: null,
  repeat_days: [],
});

const members: Member[] = [
  {
    user_id: "user-1",
    full_name: "Me Self",
    goals: [goal("a", true), goal("b", false)],
  },
  {
    user_id: "user-2",
    full_name: "Bob Smith",
    goals: [goal("c", true), goal("d", true), goal("e", false)],
  },
];

describe("MemberTabs", () => {
  it("renders 'You' for the current user and first names for others", () => {
    const { getByText } = render(
      <MemberTabs
        members={members}
        selectedTabId="user-1"
        onSelect={() => {}}
        userId="user-1"
      />,
    );
    expect(getByText("You")).toBeTruthy();
    expect(getByText("Bob")).toBeTruthy();
  });

  it("shows the per-member done/total counts", () => {
    const { getByText } = render(
      <MemberTabs
        members={members}
        selectedTabId="user-1"
        onSelect={() => {}}
        userId="user-1"
      />,
    );
    expect(getByText("1/2")).toBeTruthy();
    expect(getByText("2/3")).toBeTruthy();
  });

  it("calls onSelect with the tapped member's user_id", () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <MemberTabs
        members={members}
        selectedTabId="user-1"
        onSelect={onSelect}
        userId="user-1"
      />,
    );
    fireEvent.press(getByText("Bob"));
    expect(onSelect).toHaveBeenCalledWith("user-2");
  });
});
