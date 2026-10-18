import { fireEvent, render } from "@testing-library/react-native";

import JoinGroupScreen from "@/app/(protected)/join-group";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryClient,
} from "../test-utils/render";

describe("Join group", () => {
  it("stops a new group's name at 40 characters, the server's limit", () => {
    const supabase = buildFakeSupabase({});
    const { Wrapper } = buildWrapper({
      supabase,
      queryClient: makeQueryClient(),
    });
    const { getByText, getByPlaceholderText } = render(<JoinGroupScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByText("No code? Create a new group"));

    expect(getByPlaceholderText("Swole Mates").props.maxLength).toBe(40);
  });
});

// On iPhone, Join group is a modal over the dashboard, so the dashboard stays
// mounted underneath it. The screen used to leave only through its own
// buttons, and replacing the route did not take the sheet away: someone who
// had joined stayed on Join group, and so did someone sent here on a cached
// "no group" that the next read contradicted. It now leaves whenever the
// group read says you have one, by dismissing back to the dashboard.
describe("Join group, once you're in", () => {
  const router = require("expo-router").__router;
  const { queryKeys } = require("@/lib/queryKeys");
  const { makeQueryBuilder } = require("../test-utils/render");
  const { act, waitFor } = require("@testing-library/react-native");
  const { Alert } = require("react-native");

  const GROUP = {
    group_id: "g-2",
    name: "Night Owls",
    icon: "🦉",
    current_streak: 0,
    invite_code: "ABCDEF0123",
    last_streak_date: null,
    groups: { last_streak_date: null, current_streak: 0 },
  };

  // `inGroup`: what the server says right now about your group.
  function setup({ inGroup }: { inGroup: () => boolean }) {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(queryKeys.groupStats("user-1"), null);
    const rpcImpl = jest.fn((name: string) => {
      if (name === "get_my_group_stats") {
        return makeQueryBuilder({
          data: inGroup() ? GROUP : null,
          error: null,
        });
      }
      return makeQueryBuilder({
        data: { success: true, group_id: "g-2" },
        error: null,
      });
    });
    const fromImpl = jest.fn(() =>
      makeQueryBuilder({ data: { id: "g-2" }, error: null }),
    );
    const supabase = buildFakeSupabase({ rpcImpl, fromImpl });
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = render(<JoinGroupScreen />, { wrapper: Wrapper });
    return { ...utils, supabase, queryClient };
  }

  afterEach(() => {
    router.replace.mockReset();
    router.dismissTo.mockReset();
    jest.restoreAllMocks();
  });

  it("goes back to the dashboard after joining", async () => {
    let joined = false;
    const { getByPlaceholderText, getByText, queryClient } = setup({
      inGroup: () => joined,
    });
    expect(router.dismissTo).not.toHaveBeenCalled();

    joined = true;
    fireEvent.changeText(getByPlaceholderText("A1B2C3D4E5"), "ABCDEF0123");
    await act(async () => fireEvent.press(getByText("Join group")));

    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith("/"));
    expect(router.replace).not.toHaveBeenCalled();
    // The dashboard finds the group already read, so it has nothing to
    // redirect on.
    expect(queryClient.getQueryData(queryKeys.groupStats("user-1"))).toEqual(
      GROUP,
    );
  });

  it("goes back to the dashboard after creating", async () => {
    let created = false;
    const { getByPlaceholderText, getByText } = setup({
      inGroup: () => created,
    });

    created = true;
    fireEvent.press(getByText("No code? Create a new group"));
    fireEvent.changeText(getByPlaceholderText("Swole Mates"), "Night Owls");
    await act(async () => fireEvent.press(getByText("Create group")));

    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith("/"));
  });

  it("asks again when it opens, and leaves if you're already in a group", async () => {
    // Sent here on a cached "no group" from before you joined.
    setup({ inGroup: () => true });

    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith("/"));
  });

  it("stays while you really have no group", async () => {
    const { findByText } = setup({ inGroup: () => false });

    await findByText("Join group");
    await act(async () => {});
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it("lets you log out, after confirming", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { getByText, supabase } = setup({ inGroup: () => false });

    fireEvent.press(getByText("Log out"));
    expect(supabase.auth.signOut).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    await act(async () =>
      buttons.find((b) => b.text === "Log out")!.onPress!(),
    );
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledTimes(1));
  });
});
