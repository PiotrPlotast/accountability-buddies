import { Alert } from "react-native";
import { onlineManager } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import NewHabitScreen from "@/app/(protected)/new-habit";
import { getTodayLocalDate } from "@/lib/date";
import { onHabitSavedNotice } from "@/lib/habitSavedNotice";
import { DAY_NAMES } from "@/lib/repeatDays";
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

function setup(
  insertResult: { data: unknown; error: { message: string } | null } = {
    data: { id: "g-1", title: "Run" },
    error: null,
  },
) {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
  queryClient.setQueryData(
    queryKeys.groupMembers("group-1", getTodayLocalDate()),
    [{ user_id: "user-1", full_name: "Me", goals: [] }],
  );
  const insertQB = makeQueryBuilder(insertResult);
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

describe("New habit schedule", () => {
  // A Sunday: the day the old Mon–Fri default hid every new habit on.
  const SUNDAY = new Date(2026, 9, 11, 12);
  let notices: jest.Mock;
  let unsubscribe: () => void;

  beforeEach(() => {
    jest.useFakeTimers({ now: SUNDAY });
    notices = jest.fn();
    unsubscribe = onHabitSavedNotice(notices);
  });

  afterEach(() => {
    unsubscribe();
    onlineManager.setOnline(true);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("starts with every day selected", () => {
    const { getByLabelText } = setup();
    for (const day of DAY_NAMES) {
      expect(getByLabelText(day).props.accessibilityState.selected).toBe(true);
    }
  });

  it("creates the habit for every day when the days are left alone", async () => {
    const { getByText, insertQB } = setup();

    fireEvent.press(getByText("Create habit"));

    await waitFor(() =>
      expect(insertQB.insert).toHaveBeenCalledWith(
        expect.objectContaining({ repeat_days: [0, 1, 2, 3, 4, 5, 6] }),
      ),
    );
  });

  it("says nothing extra when the habit is due today", async () => {
    const { getByText, insertQB } = setup();

    fireEvent.press(getByText("Create habit"));

    await waitFor(() => expect(insertQB.insert).toHaveBeenCalled());
    expect(notices).not.toHaveBeenCalled();
  });

  it("tells the dashboard when the habit isn't due today", async () => {
    const { getByLabelText, getByText } = setup();

    fireEvent.press(getByLabelText("Sun"));
    fireEvent.press(getByText("Create habit"));

    await waitFor(() =>
      expect(notices).toHaveBeenCalledWith("Run saved. First up tomorrow."),
    );
  });

  it("tells the dashboard for a habit saved offline too", async () => {
    onlineManager.setOnline(false);
    const { getByLabelText, getByText } = setup();

    fireEvent.press(getByLabelText("Sun"));
    fireEvent.press(getByText("Create habit"));

    await waitFor(() =>
      expect(notices).toHaveBeenCalledWith("Run saved. First up tomorrow."),
    );
  });

  it("says nothing when the save fails", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { getByLabelText, getByText } = setup({
      data: null,
      error: { message: "nope" },
    });

    fireEvent.press(getByLabelText("Sun"));
    fireEvent.press(getByText("Create habit"));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(notices).not.toHaveBeenCalled();
  });
});
