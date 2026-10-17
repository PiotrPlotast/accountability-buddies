import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { onlineManager } from "@tanstack/react-query";
import { Alert, AlertButton } from "react-native";

import GroupSettingsScreen from "@/app/(protected)/group-settings";
import { queryKeys } from "@/lib/queryKeys";
import { GroupResult } from "@/types/dashboardTypes";
import { usePendingGoalChanges } from "@/hooks/usePendingGoalChanges";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

jest.mock("@/hooks/usePendingGoalChanges", () => ({
  usePendingGoalChanges: jest.fn(() => 0),
}));

const stats = (name: string, icon = "👥"): GroupResult => ({
  group_id: "group-1",
  name,
  icon,
  current_streak: 0,
  invite_code: "ABCDEF0123",
  last_streak_date: null,
  groups: { last_streak_date: null, current_streak: 0 },
});

function renderScreen(seed: GroupResult | null) {
  const queryClient = makeQueryClient();
  if (seed) queryClient.setQueryData(queryKeys.groupStats("user-1"), seed);
  const updateQB = makeQueryBuilder({ error: null });
  // A stats read that never settles, so an unseeded screen stays loading.
  const rpcImpl = jest.fn(() => ({ maybeSingle: () => new Promise(() => {}) }));
  const supabase = buildFakeSupabase({
    rpcImpl,
    fromImpl: jest.fn(() => updateQB),
  });
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  const utils = render(<GroupSettingsScreen />, { wrapper: Wrapper });
  // The query observer notifies on the next tick, so let it land.
  const setServer = (next: GroupResult) =>
    act(async () => {
      queryClient.setQueryData(queryKeys.groupStats("user-1"), next);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  return { ...utils, updateQB, setServer };
}

describe("Group settings name field", () => {
  it("fills in the group name once the group loads", async () => {
    const { getByPlaceholderText, setServer } = renderScreen(null);
    expect(getByPlaceholderText("Swole Mates").props.value).toBe("");

    await setServer(stats("Habit Crew"));

    expect(getByPlaceholderText("Swole Mates").props.value).toBe("Habit Crew");
  });

  it("follows a server rename while you have not typed", async () => {
    const { getByPlaceholderText, setServer } = renderScreen(
      stats("Habit Crew"),
    );

    await setServer(stats("Night Owls"));

    expect(getByPlaceholderText("Swole Mates").props.value).toBe("Night Owls");
  });

  it("keeps what you typed when the server name changes", async () => {
    const { getByPlaceholderText, setServer } = renderScreen(
      stats("Habit Crew"),
    );

    fireEvent.changeText(getByPlaceholderText("Swole Mates"), "My Crew");
    await setServer(stats("Night Owls"));

    expect(getByPlaceholderText("Swole Mates").props.value).toBe("My Crew");
  });

  it("saves only the name when the icon is untouched, after a server icon change", async () => {
    const { getByPlaceholderText, getByText, setServer, updateQB } =
      renderScreen(stats("Habit Crew"));

    await setServer(stats("Habit Crew", "🔥"));
    fireEvent.changeText(getByPlaceholderText("Swole Mates"), "My Crew");
    fireEvent.press(getByText("Save"));

    await waitFor(() =>
      expect(updateQB.update).toHaveBeenCalledWith({ name: "My Crew" }),
    );
  });

  it("saves a picked icon", async () => {
    const { getAllByText, getByText, updateQB } = renderScreen(
      stats("Habit Crew"),
    );

    fireEvent.press(getAllByText("🔥")[0]);
    fireEvent.press(getByText("Save"));

    await waitFor(() =>
      expect(updateQB.update).toHaveBeenCalledWith({ icon: "🔥" }),
    );
  });

  it("does not save when nothing changed", () => {
    const { getByText, updateQB } = renderScreen(stats("Habit Crew"));

    fireEvent.press(getByText("Save"));

    expect(updateQB.update).not.toHaveBeenCalled();
  });
});

describe("Group settings name length", () => {
  it("stops at 40 characters, the server's limit", () => {
    const { getByPlaceholderText } = renderScreen(stats("Night Owls"));
    expect(getByPlaceholderText("Swole Mates").props.maxLength).toBe(40);
  });
});

describe("Group settings Leave group", () => {
  // The mocked router `useRouter()` hands every screen (jest.setup.js).
  const router = require("expo-router").__router;
  function renderForLeave(leaveResult: {
    data?: unknown;
    error?: { message: string } | null;
  }) {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      queryKeys.groupStats("user-1"),
      stats("Habit Crew"),
    );
    const rpcImpl = jest.fn((name: string) =>
      name === "leave_group"
        ? makeQueryBuilder(leaveResult)
        : { maybeSingle: () => new Promise(() => {}) },
    );
    const supabase = buildFakeSupabase({ rpcImpl });
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = render(<GroupSettingsScreen />, { wrapper: Wrapper });
    return { ...utils, rpcImpl, queryClient };
  }

  function pressAlertButton(label: string) {
    const calls = (Alert.alert as jest.Mock).mock.calls;
    const buttons = calls[calls.length - 1][2] as AlertButton[];
    const button = buttons.find((b) => b.text === label);
    if (!button) throw new Error(`No "${label}" button`);
    button.onPress?.();
  }

  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    (router.back as jest.Mock).mockClear();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    (usePendingGoalChanges as jest.Mock).mockReturnValue(0);
    onlineManager.setOnline(true);
  });

  it("asks before leaving, naming the group and the way back", () => {
    const { getByLabelText, rpcImpl } = renderForLeave({
      data: { success: true },
      error: null,
    });

    fireEvent.press(getByLabelText("Leave group"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "Leave Habit Crew?",
      "You'll need a new invite code to come back.",
      expect.any(Array),
    );
    expect(rpcImpl).not.toHaveBeenCalledWith("leave_group");
  });

  it("leaves on Leave and closes the screen", async () => {
    const { getByLabelText, rpcImpl } = renderForLeave({
      data: { success: true },
      error: null,
    });

    fireEvent.press(getByLabelText("Leave group"));
    await act(async () => pressAlertButton("Leave"));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(rpcImpl).toHaveBeenCalledWith("leave_group");
  });

  it("does nothing on Cancel", () => {
    const { getByLabelText, rpcImpl } = renderForLeave({
      data: { success: true },
      error: null,
    });

    fireEvent.press(getByLabelText("Leave group"));
    pressAlertButton("Cancel");

    expect(rpcImpl).not.toHaveBeenCalledWith("leave_group");
  });

  it("stays on the screen when the server refuses", async () => {
    const { getByLabelText } = renderForLeave({
      data: { success: false, message: "You're not in a group" },
      error: null,
    });

    fireEvent.press(getByLabelText("Leave group"));
    await act(async () => pressAlertButton("Leave"));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Couldn't leave the group",
        "You're not in a group",
      ),
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it("warns that unsynced habit changes will be lost", () => {
    (usePendingGoalChanges as jest.Mock).mockReturnValue(2);
    const { getByLabelText } = renderForLeave({
      data: { success: true },
      error: null,
    });

    fireEvent.press(getByLabelText("Leave group"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "Leave Habit Crew?",
      "You'll need a new invite code to come back. 2 changes haven't synced and will be lost.",
      expect.any(Array),
    );
  });

  it("is greyed out offline and says it needs a connection", () => {
    act(() => onlineManager.setOnline(false));
    const { getByLabelText } = renderForLeave({
      data: { success: true },
      error: null,
    });

    const button = getByLabelText("Leave group");
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    fireEvent.press(button);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
