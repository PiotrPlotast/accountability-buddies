import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import type { Session } from "@supabase/supabase-js";

import { SupabaseContextValue } from "@/context/supabase-context";
import { useSupabase } from "@/hooks/useSupabase";
import { SupabaseProvider } from "@/providers/supabase-provider";

import { buildFakeSupabase } from "../test-utils/render";

// AsyncStorage's native module is null under Jest and the provider imports it
// for the client's auth storage — same local mock themeProvider.test.tsx uses.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// The provider builds its own client, so `createClient` is the seam. Everything
// else about @supabase/supabase-js that the provider touches (`processLock`) is
// only handed straight back to the mocked factory.
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
  processLock: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require("@supabase/supabase-js") as {
  createClient: jest.Mock;
};

type FakeClient = ReturnType<typeof buildFakeSupabase> & {
  auth: {
    getSession: jest.Mock;
    onAuthStateChange: jest.Mock;
    signOut: jest.Mock;
  };
};

let client: FakeClient;

/** The callback the provider handed to `onAuthStateChange`. */
const authCallback = (): ((event: string, session: Session | null) => void) =>
  client.auth.onAuthStateChange.mock.calls[0][0];

const unsubscribeSpy = (): jest.Mock =>
  client.auth.onAuthStateChange.mock.results[0].value.data.subscription
    .unsubscribe;

// Each consumer records the context value it saw on its most recent render, so
// a test can assert what the whole tree observed, not just one component.
const seen: Record<string, SupabaseContextValue> = {};

function Consumer({ id }: { id: string }) {
  seen[id] = useSupabase();
  return null;
}

function renderWithConsumers(ids: string[]) {
  return render(
    <SupabaseProvider>
      {ids.map((id) => (
        <Consumer key={id} id={id} />
      ))}
    </SupabaseProvider>,
  );
}

beforeEach(() => {
  for (const key of Object.keys(seen)) delete seen[key];
  client = buildFakeSupabase() as FakeClient;
  createClient.mockReturnValue(client);
});

describe("SupabaseProvider", () => {
  // The whole point of moving session state out of `useSupabase`: it used to
  // run its own getSession + onAuthStateChange per call site, which on the
  // dashboard meant ~28 concurrent subscriptions.
  it("opens one auth subscription and one session lookup for the whole tree", async () => {
    renderWithConsumers(["a", "b", "c", "d", "e"]);

    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(client.auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("hands every consumer the very same session object", async () => {
    renderWithConsumers(["a", "b", "c"]);

    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    expect(seen.a.session).toBe(seen.b.session);
    expect(seen.b.session).toBe(seen.c.session);
    expect(seen.a.session?.user.id).toBe("user-1");
  });

  it("reports isLoaded only once the session lookup has resolved", async () => {
    let resolveSession: (v: { data: { session: Session | null } }) => void;
    client.auth.getSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const settled = { data: { session: null } };

    renderWithConsumers(["a"]);

    // Still in flight: consumers must not mistake "not known yet" for "signed
    // out" — `_layout` holds the splash on exactly this flag.
    expect(seen.a.isLoaded).toBe(false);
    expect(seen.a.session).toBeNull();

    await act(async () => {
      resolveSession!(settled);
    });

    expect(seen.a.isLoaded).toBe(true);
  });

  it("still flips isLoaded when the session lookup rejects", async () => {
    client.auth.getSession.mockRejectedValueOnce(new Error("storage gone"));

    renderWithConsumers(["a"]);

    // A failed read means "signed out", never a splash that never lifts.
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));
    expect(seen.a.session).toBeNull();
  });

  it("pushes auth state changes to every consumer", async () => {
    renderWithConsumers(["a", "b"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    const next = { user: { id: "user-2" } } as unknown as Session;
    await act(async () => {
      authCallback()("SIGNED_IN", next);
    });

    expect(seen.a.session?.user.id).toBe("user-2");
    expect(seen.b.session?.user.id).toBe("user-2");
  });

  it("clears the session for every consumer on signOut", async () => {
    renderWithConsumers(["a", "b"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));
    expect(seen.a.session).not.toBeNull();

    await act(async () => {
      await seen.a.signOut();
    });

    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    // Authoritative for the whole tree, not just the caller — the old hook set
    // only its own copy and relied on onAuthStateChange to catch the rest up.
    expect(seen.a.session).toBeNull();
    expect(seen.b.session).toBeNull();
  });

  it("unsubscribes when the provider unmounts", async () => {
    const view = renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    view.unmount();

    expect(unsubscribeSpy()).toHaveBeenCalledTimes(1);
  });
});
