import { Alert } from "react-native";
import { act, waitFor } from "@testing-library/react-native";

import { useNotificationPrefs } from "@/hooks/useNotificationPrefs";
import { queryKeys } from "@/lib/queryKeys";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  renderHookWithSession,
} from "../test-utils/render";

const STORED = {
  reminders_enabled: true,
  nudges_enabled: true,
  social_enabled: true,
  timezone: "Europe/Warsaw",
  quiet_start: null,
  quiet_end: null,
};

function setup(result: { data?: unknown; error?: { message: string } | null }) {
  const qb = makeQueryBuilder(result);
  const fromImpl = jest.fn(() => qb);
  const supabase = buildFakeSupabase({ fromImpl });
  const { Wrapper, queryClient } = buildWrapper({ supabase });
  return { qb, fromImpl, supabase, Wrapper, queryClient };
}

const prefsKey = queryKeys.notificationPrefs("user-1");

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("useNotificationPrefs", () => {
  it("reads this user's row", async () => {
    const { qb, fromImpl, Wrapper } = setup({ data: STORED, error: null });
    const utils = await renderHookWithSession(
      () => useNotificationPrefs(),
      Wrapper,
    );

    await waitFor(() =>
      expect(utils.result.current.value.prefs).toEqual(STORED),
    );
    expect(fromImpl).toHaveBeenCalledWith("notification_prefs");
    expect(qb.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("updates rather than upserts", async () => {
    // The row is created by a trigger on auth.users and there is no client
    // INSERT policy — an upsert would be rejected, not helpful.
    const { qb, Wrapper } = setup({ data: STORED, error: null });
    const utils = await renderHookWithSession(
      () => useNotificationPrefs(),
      Wrapper,
    );
    await waitFor(() => expect(utils.result.current.value.prefs).toBeTruthy());

    await act(async () => {
      utils.result.current.value.setPref({ nudges_enabled: false });
    });

    await waitFor(() =>
      expect(qb.update).toHaveBeenCalledWith({ nudges_enabled: false }),
    );
    expect(qb.upsert).not.toHaveBeenCalled();
    expect(qb.insert).not.toHaveBeenCalled();
  });

  it("flips the switch before the server answers", async () => {
    // A toggle that waits out a round trip reads as a broken switch.
    let release: ((v: { error: null }) => void) | undefined;
    const qb = makeQueryBuilder({ data: STORED, error: null });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
    const { Wrapper, queryClient } = buildWrapper({ supabase });
    queryClient.setQueryData(prefsKey, STORED);

    const utils = await renderHookWithSession(
      () => useNotificationPrefs(),
      Wrapper,
    );
    await waitFor(() => expect(utils.result.current.value.prefs).toBeTruthy());

    // `eq` is the last link in the chain and the one that gets awaited, so it
    // is what has to hang — hanging `update` would leave `eq` resolving on its
    // own and the write would land immediately.
    qb.eq.mockImplementationOnce(
      () =>
        ({
          then: (resolve: (v: { error: null }) => void) => {
            release = resolve;
            return { then: () => {} };
          },
        }) as never,
    );

    act(() => {
      utils.result.current.value.setPref({ social_enabled: false });
    });

    await waitFor(() =>
      expect(utils.result.current.value.prefs?.social_enabled).toBe(false),
    );

    await act(async () => {
      release?.({ error: null });
    });
  });

  it("rolls the switch back and says so when the write fails", async () => {
    const qb = makeQueryBuilder({ data: STORED, error: null });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
    const { Wrapper, queryClient } = buildWrapper({ supabase });
    queryClient.setQueryData(prefsKey, STORED);
    const utils = await renderHookWithSession(
      () => useNotificationPrefs(),
      Wrapper,
    );
    await waitFor(() => expect(utils.result.current.value.prefs).toBeTruthy());

    // Same link as above, resolving with an error instead of hanging.
    qb.eq.mockImplementationOnce(
      () => Promise.resolve({ error: { message: "network down" } }) as never,
    );

    await act(async () => {
      utils.result.current.value.setPref({ reminders_enabled: false });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(prefsKey)).toEqual(STORED),
    );
    expect(Alert.alert).toHaveBeenCalled();
  });

  it("reports a row that has not arrived as null rather than guessing", async () => {
    // Every account gets a row from the trigger, so this is the window before
    // the read resolves — not a state the screen should render defaults for.
    const { Wrapper } = setup({ data: null, error: null });
    const utils = await renderHookWithSession(
      () => useNotificationPrefs(),
      Wrapper,
    );

    await waitFor(() =>
      expect(utils.result.current.value.isLoading).toBe(false),
    );
    expect(utils.result.current.value.prefs).toBeNull();
  });
});
