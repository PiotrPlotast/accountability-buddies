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

// The dashboard sent you here because the stats cache said "no group". If that
// answer is still cached when it mounts again, it bounces you straight back,
// which is what happened after leaving a group and creating a new one.
describe("Join group, once you're in", () => {
  const router = require("expo-router").__router;
  const { queryKeys } = require("@/lib/queryKeys");
  const { makeQueryBuilder } = require("../test-utils/render");
  const { act, waitFor } = require("@testing-library/react-native");

  function setup() {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(queryKeys.groupStats("user-1"), null);
    let statsWhenLeaving: unknown = "not navigated";
    router.replace.mockImplementation(() => {
      statsWhenLeaving = queryClient.getQueryData(
        queryKeys.groupStats("user-1"),
      );
    });
    const rpcImpl = jest.fn(() =>
      makeQueryBuilder({
        data: { success: true, group_id: "g-2" },
        error: null,
      }),
    );
    const fromImpl = jest.fn(() =>
      makeQueryBuilder({ data: { id: "g-2" }, error: null }),
    );
    const supabase = buildFakeSupabase({ rpcImpl, fromImpl });
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = render(<JoinGroupScreen />, { wrapper: Wrapper });
    return { ...utils, statsWhenLeaving: () => statsWhenLeaving };
  }

  afterEach(() => router.replace.mockReset());

  it("forgets the cached 'no group' before going to the dashboard after joining", async () => {
    const { getByPlaceholderText, getByText, statsWhenLeaving } = setup();

    fireEvent.changeText(getByPlaceholderText("A1B2C3D4E5"), "ABCDEF0123");
    await act(async () => fireEvent.press(getByText("Join group")));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(statsWhenLeaving()).toBeUndefined();
  });

  it("forgets the cached 'no group' before going to the dashboard after creating", async () => {
    const { getByPlaceholderText, getByText, statsWhenLeaving } = setup();

    fireEvent.press(getByText("No code? Create a new group"));
    fireEvent.changeText(getByPlaceholderText("Swole Mates"), "Night Owls");
    await act(async () => fireEvent.press(getByText("Create group")));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(statsWhenLeaving()).toBeUndefined();
  });
});
