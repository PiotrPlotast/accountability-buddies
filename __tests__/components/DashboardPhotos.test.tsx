import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { onlineManager } from "@tanstack/react-query";

import Dashboard from "@/app/components/dashboard/Dashboard";
import CameraModal from "@/app/components/dashboard/CameraModal";
import CheerModal from "@/app/components/dashboard/CheerModal";
import PhotoViewerModal from "@/app/components/dashboard/PhotoViewerModal";
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

function renderDashboard(members: Member[] = [me, buddyWithPhoto]) {
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
    ...render(<Dashboard />, { wrapper: Wrapper }),
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
    const { getByLabelText, supabase } = renderDashboard();

    expect(getByLabelText("Buddy's photo of Run")).toBeTruthy();
    await waitFor(() =>
      expect(supabase.storage.from).toHaveBeenCalledWith("habit-photos"),
    );
  });

  it("shows no strip when nobody has posted", () => {
    const { queryByText } = renderDashboard([me]);
    expect(queryByText("Today's photos")).toBeNull();
  });

  it("opens the viewer on the photo tapped in the strip", () => {
    const { getByLabelText, UNSAFE_getByType } = renderDashboard();

    fireEvent.press(getByLabelText("Buddy's photo of Run"));

    const viewer = UNSAFE_getByType(PhotoViewerModal);
    expect(viewer.props.initialIndex).toBe(0);
    expect(viewer.props.items[0].photo.id).toBe("p-2");
  });

  it("opens the same viewer from the photo on a buddy's habit row", () => {
    const { getByLabelText, UNSAFE_getByType } = renderDashboard();
    fireEvent.press(getByLabelText(/^Buddy Pal,/));

    fireEvent.press(getByLabelText("Photo of Run"));

    expect(UNSAFE_getByType(PhotoViewerModal).props.items[0].photo.id).toBe(
      "p-2",
    );
  });

  it("cheers a buddy's habit from their photo", () => {
    const { getByLabelText, UNSAFE_getByType } = renderDashboard();
    fireEvent.press(getByLabelText("Buddy's photo of Run"));

    act(() => {
      UNSAFE_getByType(PhotoViewerModal).props.onCheer(
        UNSAFE_getByType(PhotoViewerModal).props.items[0],
      );
    });

    expect(UNSAFE_getByType(CheerModal).props).toEqual(
      expect.objectContaining({
        recipient: { userId: "user-2", name: "Buddy" },
        goal: { id: "Run", title: "Run" },
        day: getTodayLocalDate(),
      }),
    );
  });

  it("offers a photo right after a tick, and opens the camera from it", async () => {
    const { getByLabelText, getByText, UNSAFE_queryByType } = renderDashboard();

    await act(async () => {
      fireEvent.press(getByLabelText("My habit"));
    });

    expect(getByText("Add a photo of My habit?")).toBeTruthy();
    expect(UNSAFE_queryByType(CameraModal)).toBeNull();

    fireEvent.press(getByLabelText("Add photo"));

    const cameraModal = UNSAFE_queryByType(CameraModal);
    expect(cameraModal?.props.goal.id).toBe("My habit");
    expect(cameraModal?.props.day).toBe(getTodayLocalDate());
  });

  it("lets the offer go on Not now", async () => {
    const { getByLabelText, queryByText } = renderDashboard();

    await act(async () => {
      fireEvent.press(getByLabelText("My habit"));
    });
    fireEvent.press(getByLabelText("Not now"));

    expect(queryByText("Add a photo of My habit?")).toBeNull();
  });

  it("lets the offer go by itself after a few seconds", async () => {
    jest.useFakeTimers();
    const { getByLabelText, queryByText } = renderDashboard();

    await act(async () => {
      fireEvent.press(getByLabelText("My habit"));
    });
    expect(queryByText("Add a photo of My habit?")).toBeTruthy();

    act(() => jest.advanceTimersByTime(6000));
    expect(queryByText("Add a photo of My habit?")).toBeNull();
  });

  it("offers no photo after a tick offline", async () => {
    const { getByLabelText, queryByText } = renderDashboard();
    act(() => onlineManager.setOnline(false));

    await act(async () => {
      fireEvent.press(getByLabelText("My habit"));
    });

    expect(queryByText("Add a photo of My habit?")).toBeNull();
  });

  it("opens the camera from the row of a ticked habit with no photo", () => {
    const ticked: Member = {
      ...me,
      goals: [
        goal("My habit", "user-1", { completed_today: true, photo: null }),
      ],
    };
    const { getByLabelText, UNSAFE_queryByType } = renderDashboard([
      ticked,
      buddyWithPhoto,
    ]);

    fireEvent.press(getByLabelText("Add a photo of My habit"));

    expect(UNSAFE_queryByType(CameraModal)?.props.goal.id).toBe("My habit");
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
    const { getByLabelText, UNSAFE_getByType, UNSAFE_queryByType, supabase } =
      renderDashboard([mine, buddyWithPhoto]);
    fireEvent.press(getByLabelText("Photo of My habit"));
    const viewer = UNSAFE_getByType(PhotoViewerModal);

    await act(async () => {
      viewer.props.onDelete(viewer.props.items[viewer.props.initialIndex]);
    });

    expect(supabase.rpc).toHaveBeenCalledWith("remove_habit_photo", {
      p_id: "p-1",
    });
    await waitFor(() =>
      expect(UNSAFE_queryByType(PhotoViewerModal)).toBeNull(),
    );
  });
});
