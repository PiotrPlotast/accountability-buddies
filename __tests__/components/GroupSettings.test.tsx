import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import GroupSettingsScreen from "@/app/(protected)/group-settings";
import { queryKeys } from "@/lib/queryKeys";
import { GroupResult } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

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
