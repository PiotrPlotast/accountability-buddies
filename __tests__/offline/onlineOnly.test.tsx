import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { hydrate, onlineManager, QueryClient } from "@tanstack/react-query";
import { Alert, AlertButton } from "react-native";

import Dashboard from "@/app/components/dashboard/Dashboard";
import DeleteGoalModal from "@/app/components/dashboard/DeleteGoalModal";
import EditGoalModal from "@/app/components/dashboard/EditGoalModal";
import GroupSettingsScreen from "@/app/(protected)/group-settings";
import JoinGroupScreen from "@/app/(protected)/join-group";
import NotificationSettingsScreen from "@/app/(protected)/notification-settings";
import Profile from "@/app/components/profile/Profile";
import RenameModal from "@/app/components/profile/RenameModal";
import { getTodayLocalDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { Goal, GroupResult, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

jest.mock("@/hooks/usePushPermission", () => ({
  usePushPermission: () => ({ granted: true, canAskAgain: false }),
}));

const stats: GroupResult = {
  group_id: "group-1",
  name: "Habit Crew",
  icon: "👥",
  current_streak: 0,
  invite_code: "ABCDEF0123",
  last_streak_date: null,
  groups: { last_streak_date: null, current_streak: 0 },
};

const goal = (id: string, user_id: string): Goal => ({
  id,
  title: id,
  user_id,
  group_id: "group-1",
  completed_today: false,
  icon: null,
  repeat_days: [],
});

const members: Member[] = [
  {
    user_id: "user-1",
    full_name: "Me Myself",
    goals: [goal("My habit", "user-1")],
  },
  {
    user_id: "user-2",
    full_name: "Buddy Pal",
    goals: [goal("Buddy habit", "user-2")],
  },
];

function seededClient() {
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
  queryClient.setQueryData(queryKeys.notificationPrefs("user-1"), {
    reminders_enabled: true,
    nudges_enabled: true,
    social_enabled: false,
    timezone: "Europe/Warsaw",
    quiet_start: null,
    quiet_end: null,
  });
  return queryClient;
}

/** Changes queued while offline, as the persister would restore them. */
function queueChanges(queryClient: QueryClient, count: number) {
  hydrate(queryClient, {
    queries: [],
    mutations: Array.from({ length: count }, () => ({
      mutationKey: ["goal", "toggle"],
      state: {
        context: undefined,
        data: undefined,
        error: null,
        failureCount: 0,
        failureReason: null,
        isPaused: true,
        status: "pending" as const,
        variables: { goalId: "x" },
        submittedAt: 0,
      },
    })),
  });
}

function setup() {
  const qb = makeQueryBuilder({ data: [{ id: "user-1" }], error: null });
  const fromImpl = jest.fn(() => qb);
  const rpcImpl = jest.fn(() => makeQueryBuilder({ data: [], error: null }));
  const supabase = buildFakeSupabase({ fromImpl, rpcImpl });
  const queryClient = seededClient();
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  return { qb, fromImpl, rpcImpl, supabase, queryClient, Wrapper };
}

function lastAlert() {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  return calls[calls.length - 1] as [string, string, AlertButton[]];
}

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  onlineManager.setOnline(false);
});
afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

describe("the dashboard offline", () => {
  it("says it is offline as soon as the phone does, with your habits on screen", () => {
    const { Wrapper } = setup();
    const { getByText } = render(<Dashboard />, { wrapper: Wrapper });

    expect(getByText("Offline. Showing your last update.")).toBeTruthy();
    expect(getByText("My habit")).toBeTruthy();
  });

  it("counts the changes waiting to sync", async () => {
    const { queryClient, Wrapper } = setup();
    queueChanges(queryClient, 3);
    const { findByText } = render(<Dashboard />, { wrapper: Wrapper });

    expect(await findByText("3 changes waiting to sync")).toBeTruthy();
  });

  it("drops the banner when the connection returns", async () => {
    const { Wrapper } = setup();
    const { queryByText } = render(<Dashboard />, { wrapper: Wrapper });

    act(() => onlineManager.setOnline(true));

    await waitFor(() =>
      expect(queryByText("Offline. Showing your last update.")).toBeNull(),
    );
  });

  it("greys out the nudge button on a buddy's tab", () => {
    const { Wrapper } = setup();
    const { getByLabelText, getByText, queryByText } = render(<Dashboard />, {
      wrapper: Wrapper,
    });
    fireEvent.press(getByLabelText(/^Buddy Pal,/));

    expect(getByText("Needs a connection")).toBeTruthy();
    fireEvent.press(getByText("Nudge Buddy"));
    expect(queryByText("Send")).toBeNull();
  });
});

describe("saving a habit offline", () => {
  it("closes the edit form once the change is queued", async () => {
    const { Wrapper } = setup();
    const onClose = jest.fn();
    const { getByText } = render(
      <EditGoalModal
        goal={goal("My habit", "user-1")}
        isVisible
        onClose={onClose}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.press(getByText("Save"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("closes the delete prompt once the change is queued", async () => {
    const { Wrapper } = setup();
    const onClose = jest.fn();
    const { getByText } = render(
      <DeleteGoalModal
        goal={goal("My habit", "user-1")}
        isVisible
        onClose={onClose}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.press(getByText("Delete"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("online-only screens offline", () => {
  it("won't save group settings", () => {
    const { qb, Wrapper } = setup();
    const { getByPlaceholderText, getByText } = render(
      <GroupSettingsScreen />,
      {
        wrapper: Wrapper,
      },
    );

    fireEvent.changeText(getByPlaceholderText("Swole Mates"), "My Crew");
    fireEvent.press(getByText("Save"));

    expect(getByText("Needs a connection")).toBeTruthy();
    expect(qb.update).not.toHaveBeenCalled();
  });

  it("won't join a group", () => {
    const { rpcImpl, Wrapper } = setup();
    const { getByPlaceholderText, getByText } = render(<JoinGroupScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.changeText(getByPlaceholderText("A1B2C3D4E5"), "ABCDEF0123");
    fireEvent.press(getByText("Join group"));

    expect(getByText("Needs a connection")).toBeTruthy();
    expect(rpcImpl).not.toHaveBeenCalledWith(
      "join_group_via_code",
      expect.anything(),
    );
  });

  it("won't rename you", () => {
    const { qb, Wrapper } = setup();
    const { getByPlaceholderText, getByText } = render(
      <RenameModal isVisible currentName="Piotr" onClose={jest.fn()} />,
      { wrapper: Wrapper },
    );

    fireEvent.changeText(getByPlaceholderText("Your name"), "Zofia");
    fireEvent.press(getByText("Save"));

    expect(getByText("Needs a connection")).toBeTruthy();
    expect(qb.update).not.toHaveBeenCalled();
  });

  it("won't start deleting the account", () => {
    const { Wrapper } = setup();
    const { getByLabelText, getByText } = render(<Profile />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByLabelText("Delete account"));

    expect(getByText("Needs a connection")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("won't change notification preferences", () => {
    const { qb, Wrapper } = setup();
    const { getByLabelText, getByText } = render(
      <NotificationSettingsScreen />,
      {
        wrapper: Wrapper,
      },
    );

    fireEvent(getByLabelText("Nudges"), "valueChange", false);

    expect(getByText("Needs a connection")).toBeTruthy();
    expect(qb.update).not.toHaveBeenCalled();
  });

  // Haptics is a setting on this phone, not the account.
  it("still lets you switch haptics", () => {
    const { Wrapper } = setup();
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    expect(getByLabelText("Haptics").props.disabled).toBeFalsy();
  });
});

describe("signing out with changes waiting", () => {
  it("warns that they will be lost", () => {
    const { queryClient, Wrapper } = setup();
    queueChanges(queryClient, 2);
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByLabelText("Log out"));

    const [, message, buttons] = lastAlert();
    expect(message).toBe("2 changes haven't synced and will be lost.");
    expect(buttons.map((b) => b.text)).toContain("Log out");
  });

  it("asks the usual question when nothing is waiting", () => {
    const { Wrapper } = setup();
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByLabelText("Log out"));

    expect(lastAlert()[1]).toBe("Are you sure?");
  });
});
