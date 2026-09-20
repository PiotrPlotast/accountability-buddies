import React from "react";
import { Alert, Platform } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import {
  SupabaseContext,
  SupabaseContextValue,
} from "@/context/supabase-context";
import { usePushRegistration } from "@/hooks/usePushRegistration";

import {
  buildFakeSupabase,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

// The native side of registration is `lib/push`'s job and has its own suite;
// what this hook owns is the orchestration — when it runs, what it sends, and
// what it does when either half fails.
jest.mock("@/lib/push", () => ({
  registerForPushNotificationsAsync: jest.fn(),
}));
jest.mock("@/lib/deviceId", () => ({
  getDeviceId: jest.fn(() => Promise.resolve("device-id-1")),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerForPushNotificationsAsync } = require("@/lib/push") as {
  registerForPushNotificationsAsync: jest.Mock;
};

const TOKEN = "ExponentPushToken[device]";

function Harness() {
  usePushRegistration();
  return null;
}

function renderWithUser(
  userId: string | null,
  supabase: SupabaseClient = buildFakeSupabase(),
) {
  const queryClient = makeQueryClient();
  const value = (uid: string | null): SupabaseContextValue => ({
    supabase,
    session: uid ? ({ user: { id: uid } } as Session) : null,
    isLoaded: true,
    signOut: jest.fn(),
  });
  const Tree = ({ uid }: { uid: string | null }) => (
    <QueryClientProvider client={queryClient}>
      <SupabaseContext.Provider value={value(uid)}>
        <Harness />
      </SupabaseContext.Provider>
    </QueryClientProvider>
  );
  const view = render(<Tree uid={userId} />);
  return {
    supabase,
    ...view,
    setUser: (uid: string | null) => view.rerender(<Tree uid={uid} />),
  };
}

const rpcCalls = (supabase: SupabaseClient) =>
  (supabase.rpc as unknown as jest.Mock).mock.calls;

beforeEach(() => {
  jest.clearAllMocks();
  registerForPushNotificationsAsync.mockResolvedValue({
    token: TOKEN,
    status: "granted",
  });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  // The hook logs failures rather than surfacing them; keep that out of the
  // test output without losing the assertion that nothing was surfaced.
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("usePushRegistration", () => {
  it("registers this device's token through the RPC", async () => {
    // Writes go through register_push_token, not a client upsert: RLS cannot
    // let a new account take over a row the previous one owns.
    const { supabase } = renderWithUser("user-1");

    await waitFor(() => expect(rpcCalls(supabase).length).toBe(1));
    expect(rpcCalls(supabase)[0]).toEqual([
      "register_push_token",
      { p_token: TOKEN, p_device_id: "device-id-1", p_platform: Platform.OS },
    ]);
  });

  it("does nothing at all without a session", async () => {
    // The hook mounts in `(protected)/_layout.tsx`, which only renders behind
    // the session guard — but a sign-out unmounts that tree mid-flight.
    const { supabase } = renderWithUser(null);

    await waitFor(() =>
      expect(registerForPushNotificationsAsync).not.toHaveBeenCalled(),
    );
    expect(rpcCalls(supabase)).toHaveLength(0);
  });

  it("never calls the RPC when there is no token to send", async () => {
    registerForPushNotificationsAsync.mockResolvedValue({
      token: null,
      status: "denied",
    });
    const { supabase } = renderWithUser("user-1");

    await waitFor(() =>
      expect(registerForPushNotificationsAsync).toHaveBeenCalled(),
    );
    expect(rpcCalls(supabase)).toHaveLength(0);
  });

  it("registers once, not on every render", async () => {
    const { supabase, setUser } = renderWithUser("user-1");
    await waitFor(() => expect(rpcCalls(supabase).length).toBe(1));

    setUser("user-1");
    setUser("user-1");

    await waitFor(() => expect(rpcCalls(supabase).length).toBe(1));
  });

  it("registers again when a different account signs in on this device", async () => {
    // The account-switch case the SECURITY DEFINER RPC exists for: the row has
    // to move to the new owner, or the previous user keeps getting the pushes.
    const { supabase, setUser } = renderWithUser("user-1");
    await waitFor(() => expect(rpcCalls(supabase).length).toBe(1));

    setUser("user-2");

    await waitFor(() => expect(rpcCalls(supabase).length).toBe(2));
  });

  it("stays silent when the RPC fails", async () => {
    // A background effect on first paint. An Alert here would fire on a cold
    // start with no user action behind it; the settings screen is where the
    // state belongs.
    const supabase = buildFakeSupabase({
      rpcImpl: jest.fn(() =>
        makeQueryBuilder({ error: { message: "network down" } }),
      ),
    });
    renderWithUser("user-1", supabase);

    await waitFor(() => expect(rpcCalls(supabase).length).toBe(1));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("stays silent when registration itself throws", async () => {
    registerForPushNotificationsAsync.mockRejectedValue(new Error("boom"));
    const { supabase } = renderWithUser("user-1");

    await waitFor(() =>
      expect(registerForPushNotificationsAsync).toHaveBeenCalled(),
    );
    expect(rpcCalls(supabase)).toHaveLength(0);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
