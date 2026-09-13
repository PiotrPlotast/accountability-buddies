import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import * as haptics from "@/lib/haptics";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  renderHookWithSession,
} from "../test-utils/render";

function okRpc() {
  return jest.fn(() => makeQueryBuilder({ data: null, error: null }));
}

/**
 * React Query notifies its observers a tick after the mutation settles, which
 * lands outside the `act` that awaited it. Waiting on the terminal state pulls
 * that notification inside an act window instead of letting it surface as an
 * unwrapped-update warning.
 */
async function settle(utils: {
  result: { current: { value: { isSuccess: boolean; isError: boolean } } };
}) {
  await waitFor(() => {
    const m = utils.result.current.value;
    expect(m.isSuccess || m.isError).toBe(true);
  });
}

describe("useDeleteAccount", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("deletes through the RPC, never through a table", async () => {
    const rpcImpl = okRpc();
    const fromImpl = jest.fn(() => makeQueryBuilder({ error: null }));
    const supabase = buildFakeSupabase({ rpcImpl, fromImpl });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useDeleteAccount(),
      Wrapper,
    );

    await act(async () => {
      await utils.result.current.value.mutateAsync();
    });
    await settle(utils);

    expect(rpcImpl).toHaveBeenCalledWith("delete_my_account");
    // `auth.users` is unreachable from the client and nothing cascades from
    // `profiles`, so a client-side delete would half-finish. One RPC or nothing.
    expect(fromImpl).not.toHaveBeenCalled();
  });

  it("signs out only once the account is actually gone", async () => {
    let finishRpc: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      finishRpc = resolve;
    });
    const rpcImpl = jest.fn(() => pending);
    const supabase = buildFakeSupabase({ rpcImpl });
    const signOut = supabase.auth.signOut as jest.Mock;
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useDeleteAccount(),
      Wrapper,
    );

    let mutation: Promise<unknown> = Promise.resolve();
    await act(async () => {
      mutation = utils.result.current.value.mutateAsync();
    });

    // Signing out first would drop the JWT the RPC needs to know who to delete.
    expect(signOut).not.toHaveBeenCalled();

    await act(async () => {
      finishRpc({ data: null, error: null });
      await mutation;
    });

    expect(signOut).toHaveBeenCalled();
  });

  it("keeps the user signed in when the delete fails", async () => {
    const rpcImpl = jest.fn(() =>
      makeQueryBuilder({ data: null, error: { message: "boom" } }),
    );
    const supabase = buildFakeSupabase({ rpcImpl });
    const signOut = supabase.auth.signOut as jest.Mock;
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useDeleteAccount(),
      Wrapper,
    );

    await act(async () => {
      await utils.result.current.value.mutateAsync().catch(() => {});
    });

    // Signing out here would strand the user outside an account that still
    // exists, with no way back in if the failure was their only session.
    expect(signOut).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Couldn't delete your account",
        expect.stringContaining("boom"),
      );
    });
  });

  it("does not call the RPC without a session", async () => {
    const rpcImpl = okRpc();
    const supabase = buildFakeSupabase({ userId: "", rpcImpl });
    const { Wrapper } = buildWrapper({ supabase });

    // Plain `renderHook`: `renderHookWithSession` waits for a session that by
    // construction never arrives here.
    const { result, unmount } = renderHook(() => useDeleteAccount(), {
      wrapper: Wrapper,
    });
    // The guard rejects on the first tick, and React Query then notifies its
    // observers a tick later — outside any `act` window, which React reports
    // as an unwrapped update. Unmounting first leaves nothing to notify; the
    // mutation object stays usable, and the guard is hook logic, not render
    // output.
    unmount();

    const thrown = await result.current.mutateAsync().catch((e: unknown) => e);

    expect((thrown as Error).message).toBe("No user");
    expect(rpcImpl).not.toHaveBeenCalled();
  });
});

describe("useDeleteAccount haptics", () => {
  let destructive: jest.SpyInstance;
  let errorBuzz: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    destructive = jest
      .spyOn(haptics, "destructive")
      .mockImplementation(() => {});
    errorBuzz = jest.spyOn(haptics, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("warns on the confirming tap, before the request goes out", async () => {
    const rpcImpl = okRpc();
    const supabase = buildFakeSupabase({ rpcImpl });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useDeleteAccount(),
      Wrapper,
    );

    await act(async () => {
      await utils.result.current.value.mutateAsync();
    });
    await settle(utils);

    // The buzz confirms the touch, so it fires from the tap path — never from
    // the response, which by then belongs to a user who no longer exists.
    expect(destructive).toHaveBeenCalled();
    expect(destructive.mock.invocationCallOrder[0]).toBeLessThan(
      rpcImpl.mock.invocationCallOrder[0],
    );
  });

  it("buzzes an error beside the alert when the delete fails", async () => {
    const rpcImpl = jest.fn(() =>
      makeQueryBuilder({ data: null, error: { message: "boom" } }),
    );
    const supabase = buildFakeSupabase({ rpcImpl });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useDeleteAccount(),
      Wrapper,
    );

    await act(async () => {
      await utils.result.current.value.mutateAsync().catch(() => {});
    });
    await settle(utils);

    expect(errorBuzz).toHaveBeenCalled();
  });
});
