import { Alert } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import GoalList, { GoalListView } from "@/app/components/dashboard/GoalList";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { Goal, GroupResult, HabitPhoto, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryClient,
} from "../test-utils/render";

const photo: HabitPhoto = {
  id: "p-1",
  path: "user-1/g-1/2026-11-03/a.jpg",
  createdAt: "2026-11-03T08:00:00Z",
  removed: false,
};

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g-1",
  title: "Run",
  user_id: "user-1",
  group_id: "group-1",
  completed_today: true,
  icon: "🏃",
  repeat_days: [],
  ...over,
});

function renderView(
  goals: Goal[],
  props: Partial<Parameters<typeof GoalListView>[0]> = {},
) {
  const handlers = {
    onToggle: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onOpenPhoto: jest.fn(),
    onAddPhoto: jest.fn(),
  };
  const utils = render(
    <GoalListView
      goals={goals}
      loading={false}
      canEdit
      photoUrls={{ [photo.path]: "signed:a.jpg" }}
      {...handlers}
      {...props}
    />,
  );
  return { ...utils, ...handlers };
}

describe("a habit row's photo", () => {
  it("shows your ticked habit's photo, which opens the viewer", () => {
    const g = goal({ photo });
    const { getByLabelText, onOpenPhoto, onToggle } = renderView([g]);

    fireEvent.press(getByLabelText("Photo of Run"));

    expect(onOpenPhoto).toHaveBeenCalledWith(g);
    // Its own button, beside the row: opening it doesn't untick the habit.
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("offers the camera on your ticked habit with no photo yet", () => {
    const g = goal({ photo: null });
    const { getByLabelText, onAddPhoto } = renderView([g]);

    fireEvent.press(getByLabelText("Add a photo of Run"));

    expect(onAddPhoto).toHaveBeenCalledWith(g);
  });

  it("shows the camera disabled offline", () => {
    const { getByLabelText, onAddPhoto } = renderView([goal({ photo: null })], {
      photosOffline: true,
    });

    const button = getByLabelText("Add a photo of Run");
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    fireEvent.press(button);
    expect(onAddPhoto).not.toHaveBeenCalled();
  });

  it("offers no camera on an unticked habit: no tick, no photo", () => {
    const { queryByLabelText } = renderView([goal({ completed_today: false })]);
    expect(queryByLabelText("Add a photo of Run")).toBeNull();
  });

  it("offers no camera once the day's photo is used, even if it was deleted", () => {
    const { queryByLabelText } = renderView([
      goal({ photo: { ...photo, removed: true } }),
    ]);
    expect(queryByLabelText("Add a photo of Run")).toBeNull();
    expect(queryByLabelText("Photo of Run")).toBeNull();
  });

  it("shows a buddy's photo, and never a camera on their rows", () => {
    const g = goal({ user_id: "user-2", photo });
    const { getByLabelText, queryByLabelText, onOpenPhoto } = renderView(
      [g, goal({ id: "g-2", title: "Walk", user_id: "user-2", photo: null })],
      { canEdit: false },
    );

    fireEvent.press(getByLabelText("Photo of Run"));
    expect(onOpenPhoto).toHaveBeenCalledWith(g);
    expect(queryByLabelText("Add a photo of Walk")).toBeNull();
  });

  it("shows nothing new without the photo handlers (the tour)", () => {
    const { queryByLabelText } = render(
      <GoalListView
        goals={[goal({ photo })]}
        loading={false}
        canEdit
        onToggle={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );
    expect(queryByLabelText("Photo of Run")).toBeNull();
    expect(queryByLabelText("Add a photo of Run")).toBeNull();
  });
});

describe("ticking and unticking a habit with a photo", () => {
  const stats: GroupResult = {
    group_id: "group-1",
    name: "Habit Crew",
    icon: "👥",
    current_streak: 0,
    invite_code: "ABCDEF0123",
    last_streak_date: null,
    groups: { last_streak_date: null, current_streak: 0 },
  };

  function renderList(goals: Goal[], onTicked = jest.fn()) {
    const queryClient = makeQueryClient();
    const members: Member[] = [{ user_id: "user-1", full_name: "Me", goals }];
    queryClient.setQueryData(queryKeys.groupStats("user-1"), stats);
    queryClient.setQueryData(
      queryKeys.groupMembers("group-1", getTodayLocalDate()),
      members,
    );
    const supabase = buildFakeSupabase();
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = render(
      <GoalList
        selectedTabId="user-1"
        goals={goals}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onTicked={onTicked}
      />,
      { wrapper: Wrapper },
    );
    return { ...utils, supabase, onTicked };
  }

  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("asks before unticking a habit whose photo would go with it", async () => {
    const { getByLabelText, supabase } = renderList([goal({ photo })]);

    fireEvent.press(getByLabelText("Run"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "Untick Run?",
      "This will delete your photo.",
      expect.any(Array),
    );
    expect(supabase.from).not.toHaveBeenCalledWith("logs");

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    expect(buttons.map((b: { text: string }) => b.text)).toEqual([
      "Cancel",
      "Untick",
    ]);
    await act(async () => {
      buttons[1].onPress();
    });
    expect(supabase.from).toHaveBeenCalledWith("logs");
  });

  it("unticks at once when there is no photo to lose", async () => {
    const { getByLabelText, supabase } = renderList([goal({ photo: null })]);

    await act(async () => {
      fireEvent.press(getByLabelText("Run"));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith("logs");
  });

  it("reports a tick, so the dashboard can offer a photo", async () => {
    const g = goal({ completed_today: false });
    const { getByLabelText, onTicked } = renderList([g]);

    await act(async () => {
      fireEvent.press(getByLabelText("Run"));
    });

    expect(onTicked).toHaveBeenCalledWith(g);
  });

  it("reports nothing on an untick", async () => {
    const { getByLabelText, onTicked } = renderList([goal({ photo: null })]);

    await act(async () => {
      fireEvent.press(getByLabelText("Run"));
    });

    expect(onTicked).not.toHaveBeenCalled();
  });
});
