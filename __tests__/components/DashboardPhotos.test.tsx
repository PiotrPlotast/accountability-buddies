import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { onlineManager } from "@tanstack/react-query";

import Dashboard from "@/app/components/dashboard/Dashboard";
import { getTodayLocalDate } from "@/lib/date";
import * as haptics from "@/lib/haptics";
import { queryKeys } from "@/lib/queryKeys";
import { Goal, GroupResult, HabitPhoto, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

const stats: GroupResult = {
  group_id: "group-1",
  name: "Habit Crew",
  icon: "👥",
  current_streak: 0,
  invite_code: "ABCDEF0123",
  last_streak_date: null,
  groups: { last_streak_date: null, current_streak: 0 },
};

const photo = (id: string, path: string, createdAt: string): HabitPhoto => ({
  id,
  path,
  createdAt,
  removed: false,
});

const goal = (id: string, user_id: string, over: Partial<Goal> = {}): Goal => ({
  id,
  title: id,
  user_id,
  group_id: "group-1",
  completed_today: false,
  icon: null,
  repeat_days: [],
  ...over,
});

const me: Member = {
  user_id: "user-1",
  full_name: "Me Myself",
  goals: [goal("My habit", "user-1")],
};
const buddyWithPhoto: Member = {
  user_id: "user-2",
  full_name: "Buddy Pal",
  goals: [
    goal("Run", "user-2", {
      completed_today: true,
      photo: photo("p-2", "user-2/Run/a.jpg", "2026-11-03T09:00:00Z"),
    }),
  ],
};

async function renderDashboard(members: Member[] = [me, buddyWithPhoto]) {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
  queryClient.setQueryData(
    queryKeys.groupMembers("group-1", getTodayLocalDate()),
    members,
  );
  queryClient.setQueryData(queryKeys.profile("user-1"), {
    full_name: "Me Myself",
    avatar_url: null,
  });
  const supabase = buildFakeSupabase({
    rpcImpl: jest.fn(() =>
      makeQueryBuilder({
        data: { success: true, message: "ok" },
        error: null,
      } as never),
    ),
  });
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  return {
    queryClient,
    supabase,
    ...(await render(<Dashboard />, { wrapper: Wrapper })),
  };
}

describe("Dashboard habit photos", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(haptics, "toggleDone").mockImplementation(() => {});
    jest.spyOn(haptics, "celebrate").mockImplementation(() => {});
  });
  afterEach(() => {
    onlineManager.setOnline(true);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("shows today's group photos above the tabs, signed for viewing", async () => {
    const { getByLabelText, supabase } = await renderDashboard();

    expect(getByLabelText("Buddy's photo of Run")).toBeTruthy();
    await waitFor(() =>
      expect(supabase.storage.from).toHaveBeenCalledWith("habit-photos"),
    );
  });

  it("shows no strip when nobody has posted", async () => {
    const { queryByText } = await renderDashboard([me]);
    expect(queryByText("Today's photos")).toBeNull();
  });

  // The viewer is open when its photo is on screen: an image (the strip's
  // thumbnail of it is a button), named for its poster and habit.
  it("opens the viewer on the photo tapped in the strip", async () => {
    const { getByLabelText, getByRole } = await renderDashboard();

    await fireEvent.press(getByLabelText("Buddy's photo of Run"));

    expect(getByRole("image", { name: "Buddy's photo of Run" })).toBeTruthy();
    expect(getByRole("header", { name: "Buddy" })).toBeTruthy();
  });

  it("opens the same viewer from the photo on a buddy's habit row", async () => {
    const { getByLabelText, getByRole } = await renderDashboard();
    await fireEvent.press(getByLabelText(/^Buddy Pal,/));

    await fireEvent.press(getByLabelText("Photo of Run"));

    expect(getByRole("image", { name: "Buddy's photo of Run" })).toBeTruthy();
  });

  it("cheers a buddy's habit from their photo", async () => {
    const { getByLabelText, getByText, supabase } = await renderDashboard();
    await fireEvent.press(getByLabelText("Buddy's photo of Run"));

    await fireEvent.press(getByLabelText("Cheer Buddy"));
    expect(getByText("Cheer Buddy for Run")).toBeTruthy();
    await fireEvent.press(getByText("Send"));

    expect(supabase.functions.invoke).toHaveBeenCalledWith("send-cheer", {
      body: {
        recipient_id: "user-2",
        message: "",
        goal_id: "Run",
        day: getTodayLocalDate(),
      },
    });
  });

  // The camera opens on the habit just ticked, dated the day it was ticked:
  // what it posts says both.
  it("offers a photo right after a tick, and opens the camera from it", async () => {
    const { getByLabelText, getByText, queryByTestId, supabase } =
      await renderDashboard();

    await act(async () => {
      await fireEvent.press(getByLabelText("My habit"));
    });

    expect(getByText("Add a photo of My habit?")).toBeTruthy();
    expect(queryByTestId("camera-view")).toBeNull();

    await fireEvent.press(getByLabelText("Add photo"));

    expect(getByText("Photo of My habit")).toBeTruthy();
    await fireEvent.press(getByLabelText("Take photo"));
    await fireEvent.press(getByLabelText("Post photo"));

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith(
        "attach_habit_photo",
        expect.objectContaining({
          p_goal: "My habit",
          p_day: getTodayLocalDate(),
        }),
      ),
    );
  });

  it("lets the offer go on Not now", async () => {
    const { getByLabelText, queryByText } = await renderDashboard();

    await act(async () => {
      await fireEvent.press(getByLabelText("My habit"));
    });
    await fireEvent.press(getByLabelText("Not now"));

    expect(queryByText("Add a photo of My habit?")).toBeNull();
  });

  it("lets the offer go by itself after a few seconds", async () => {
    jest.useFakeTimers();
    const { getByLabelText, queryByText } = await renderDashboard();

    await act(async () => {
      await fireEvent.press(getByLabelText("My habit"));
    });
    expect(queryByText("Add a photo of My habit?")).toBeTruthy();

    await act(() => jest.advanceTimersByTime(6000));
    expect(queryByText("Add a photo of My habit?")).toBeNull();
  });

  it("offers no photo after a tick offline", async () => {
    const { getByLabelText, queryByText } = await renderDashboard();
    await act(() => onlineManager.setOnline(false));

    await act(async () => {
      await fireEvent.press(getByLabelText("My habit"));
    });

    expect(queryByText("Add a photo of My habit?")).toBeNull();
  });

  it("opens the camera from the row of a ticked habit with no photo", async () => {
    const ticked: Member = {
      ...me,
      goals: [
        goal("My habit", "user-1", { completed_today: true, photo: null }),
      ],
    };
    const { getByLabelText, getByText, getByTestId } = await renderDashboard([
      ticked,
      buddyWithPhoto,
    ]);

    await fireEvent.press(getByLabelText("Add a photo of My habit"));

    expect(getByText("Photo of My habit")).toBeTruthy();
    expect(getByTestId("camera-view")).toBeTruthy();
  });

  it("deletes your own photo from the viewer", async () => {
    const mine: Member = {
      ...me,
      goals: [
        goal("My habit", "user-1", {
          completed_today: true,
          photo: photo("p-1", "user-1/My habit/a.jpg", "2026-11-03T10:00:00Z"),
        }),
      ],
    };
    const { getByLabelText, getByRole, queryByRole, supabase } =
      await renderDashboard([mine, buddyWithPhoto]);
    await fireEvent.press(getByLabelText("Photo of My habit"));
    expect(getByRole("image", { name: "Your photo of My habit" })).toBeTruthy();

    await fireEvent.press(getByLabelText("Delete photo"));
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2];
    await act(async () => {
      buttons.find((b: { text: string }) => b.text === "Delete").onPress();
    });

    expect(supabase.rpc).toHaveBeenCalledWith("remove_habit_photo", {
      p_id: "p-1",
    });
    await waitFor(() =>
      expect(
        queryByRole("image", { name: "Your photo of My habit" }),
      ).toBeNull(),
    );
  });
});
