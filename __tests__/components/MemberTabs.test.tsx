import { render, fireEvent } from "@testing-library/react-native";

import * as haptics from "@/lib/haptics";
import MemberTabs from "@/app/components/dashboard/MemberTabs";
import { ThemeProvider } from "@/providers/theme-provider";
import { Goal, Member } from "@/types/dashboardTypes";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

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

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

describe("MemberTabs", () => {
  it("renders 'You' for the current user and first names for others", () => {
    const { getByText } = wrap(
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
    const { getByText } = wrap(
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
    const { getByText } = wrap(
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

  it("excludes goals not due today from the count", () => {
    const membersWithSchedules: Member[] = [
      {
        user_id: "user-3",
        full_name: "Carol",
        goals: [
          goal("daily-1", true),
          goal("daily-2", false),
          goal("off-day", true),
        ].map((g, idx) =>
          idx === 2 ? { ...g, repeat_days: [9] } : { ...g, repeat_days: [] },
        ),
      },
    ];
    const { getByText, queryByText } = wrap(
      <MemberTabs
        members={membersWithSchedules}
        selectedTabId="user-3"
        onSelect={() => {}}
        userId="user-3"
      />,
    );
    expect(getByText("1/2")).toBeTruthy();
    expect(queryByText("1/3")).toBeNull();
  });
});

describe("MemberTabs haptics", () => {
  let tap: jest.SpyInstance;

  beforeEach(() => {
    tap = jest.spyOn(haptics, "tapLight").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("taps when a member tab is chosen", () => {
    const onSelect = jest.fn();
    const { getByText } = wrap(
      <MemberTabs
        members={members}
        selectedTabId="user-1"
        onSelect={onSelect}
        userId="user-1"
      />,
    );

    fireEvent.press(getByText("Bob"));
    expect(tap).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("user-2");
  });
});
