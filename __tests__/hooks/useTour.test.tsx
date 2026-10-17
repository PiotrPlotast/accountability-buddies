import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useCompleteTour, useTourGate, useTourSeenSync } from "@/hooks/useTour";
import { queryKeys } from "@/lib/queryKeys";
import { markTourSeenLocally, wasTourSeenLocally } from "@/lib/tour";
import { ProfileRow } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
  renderHookWithSession,
} from "../test-utils/render";

const NEW_USER: ProfileRow = {
  full_name: "Ada",
  avatar_url: null,
  tour_seen_at: null,
};
const SEEN: ProfileRow = {
  full_name: "Ada",
  avatar_url: null,
  tour_seen_at: "2026-10-16T10:00:00Z",
};

function setup(
  profile: ProfileRow | null,
  write: { error: { message: string } | null } = { error: null },
) {
  const read = makeQueryBuilder({ data: profile, error: null });
  const update = makeQueryBuilder(write);
  // Reads go through `select`, the write through `update`: hand each its own
  // builder so a test can tell them apart.
  const fromImpl = jest.fn(() => ({
    ...read,
    update: jest.fn((...args: unknown[]) => {
      update.update(...args);
      return update;
    }),
  }));
  const supabase = buildFakeSupabase({ fromImpl });
  const queryClient = makeQueryClient();
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  return { Wrapper, queryClient, update };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("useTourGate", () => {
  it("holds back until the profile has been read", async () => {
    const never = new Promise(() => {});
    const qb = makeQueryBuilder({ data: null, error: null });
    qb.maybeSingle = jest.fn(() => never) as unknown as jest.Mock;
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(() => useTourGate(), Wrapper);

    expect(utils.result.current.value.isResolved).toBe(false);
    expect(utils.result.current.value.needsTour).toBe(false);
  });

  it("shows the tour to a named user who has never seen it", async () => {
    const { Wrapper } = setup(NEW_USER);

    const utils = await renderHookWithSession(() => useTourGate(), Wrapper);

    await waitFor(() => {
      expect(utils.result.current.value.needsTour).toBe(true);
    });
    expect(utils.result.current.value.isResolved).toBe(true);
  });

  it("skips it for an account that has seen it", async () => {
    const { Wrapper } = setup(SEEN);

    const utils = await renderHookWithSession(() => useTourGate(), Wrapper);

    await waitFor(() => {
      expect(utils.result.current.value.isResolved).toBe(true);
    });
    expect(utils.result.current.value.needsTour).toBe(false);
  });

  it("never shows it off a cached profile that predates the column", async () => {
    // An existing user's persisted cache has no `tour_seen_at` key at all.
    // Reading that as "never seen" would flash the tour at everyone on update.
    const { Wrapper } = setup({ full_name: "Ada", avatar_url: null });

    const utils = await renderHookWithSession(() => useTourGate(), Wrapper);

    await waitFor(() => {
      expect(utils.result.current.value.isResolved).toBe(true);
    });
    expect(utils.result.current.value.needsTour).toBe(false);
  });

  it("waits for the name first", async () => {
    const { Wrapper } = setup({ ...NEW_USER, full_name: null });

    const utils = await renderHookWithSession(() => useTourGate(), Wrapper);

    await waitFor(() => {
      expect(utils.result.current.value.isResolved).toBe(true);
    });
    expect(utils.result.current.value.needsTour).toBe(false);
  });

  it("stays dismissed on this phone when the server never heard", async () => {
    await markTourSeenLocally("user-1");
    const { Wrapper } = setup(NEW_USER);

    const utils = await renderHookWithSession(() => useTourGate(), Wrapper);

    await waitFor(() => {
      expect(utils.result.current.value.isResolved).toBe(true);
    });
    expect(utils.result.current.value.needsTour).toBe(false);
  });
});

describe("useCompleteTour", () => {
  it("stores the time on the profile and closes the gate at once", async () => {
    const { Wrapper, update } = setup(NEW_USER);

    const utils = await renderHookWithSession(
      () => ({ gate: useTourGate(), complete: useCompleteTour() }),
      Wrapper,
    );
    await waitFor(() => {
      expect(utils.result.current.value.gate.needsTour).toBe(true);
    });

    act(() => utils.result.current.value.complete());

    await waitFor(() => {
      expect(utils.result.current.value.gate.needsTour).toBe(false);
    });
    await waitFor(() => {
      expect(update.update).toHaveBeenCalledWith({
        tour_seen_at: expect.any(String),
      });
    });
    expect(update.eq).toHaveBeenCalledWith("id", "user-1");
    await expect(wasTourSeenLocally("user-1")).resolves.toBe(true);
  });

  it("keeps it dismissed, without an alert, when the write fails", async () => {
    const { Wrapper, update, queryClient } = setup(NEW_USER, {
      error: { message: "offline" },
    });

    const utils = await renderHookWithSession(
      () => ({ gate: useTourGate(), complete: useCompleteTour() }),
      Wrapper,
    );
    await waitFor(() => {
      expect(utils.result.current.value.gate.needsTour).toBe(true);
    });

    act(() => utils.result.current.value.complete());

    await waitFor(() => expect(update.update).toHaveBeenCalled());
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(0);
    });
    expect(utils.result.current.value.gate.needsTour).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
    await expect(wasTourSeenLocally("user-1")).resolves.toBe(true);
  });

  it("writes nothing when the account has already seen it (a replay)", async () => {
    const { Wrapper, update, queryClient } = setup(SEEN);
    queryClient.setQueryData(queryKeys.profile("user-1"), SEEN);

    const utils = await renderHookWithSession(() => useCompleteTour(), Wrapper);

    act(() => utils.result.current.value());

    expect(update.update).not.toHaveBeenCalled();
  });
});

describe("useTourSeenSync", () => {
  it("sends a dismissal the server missed", async () => {
    await markTourSeenLocally("user-1");
    const { Wrapper, update } = setup(NEW_USER);

    await renderHookWithSession(() => useTourSeenSync(), Wrapper);

    await waitFor(() => {
      expect(update.update).toHaveBeenCalledWith({
        tour_seen_at: expect.any(String),
      });
    });
    expect(update.update).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the server already knows", async () => {
    await markTourSeenLocally("user-1");
    const { Wrapper, update, queryClient } = setup(SEEN);

    await renderHookWithSession(() => useTourSeenSync(), Wrapper);

    await waitFor(() => {
      expect(
        queryClient.getQueryData(queryKeys.profile("user-1")),
      ).toBeTruthy();
    });
    expect(update.update).not.toHaveBeenCalled();
  });

  it("does nothing for a user who has not finished it", async () => {
    const { Wrapper, update, queryClient } = setup(NEW_USER);

    await renderHookWithSession(() => useTourSeenSync(), Wrapper);

    await waitFor(() => {
      expect(
        queryClient.getQueryData(queryKeys.profile("user-1")),
      ).toBeTruthy();
    });
    expect(update.update).not.toHaveBeenCalled();
  });
});
