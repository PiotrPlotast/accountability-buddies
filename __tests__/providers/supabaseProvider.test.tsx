import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { SupabaseContextValue } from "@/context/supabase-context";
import { useSupabase } from "@/hooks/useSupabase";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { queryKeys } from "@/lib/queryKeys";

import {
  buildFakeSupabase,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

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

// The persisted mirror of the cache is a module-level singleton shared with
// `app/_layout.tsx`; the seam is the persister itself.
jest.mock("@/lib/queryPersister", () => ({
  asyncStoragePersister: { removeClient: jest.fn(() => Promise.resolve()) },
}));

// This device's push token is remembered in `lib/push` module scope; the
// provider only reads it, so that module is the seam.
jest.mock("@/lib/push", () => ({
  getRegisteredPushToken: jest.fn(() => null),
  forgetRegisteredPushToken: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require("@supabase/supabase-js") as {
  createClient: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { asyncStoragePersister } = require("@/lib/queryPersister") as {
  asyncStoragePersister: { removeClient: jest.Mock };
};

const { getRegisteredPushToken, forgetRegisteredPushToken } =
  require("@/lib/push") as {
    getRegisteredPushToken: jest.Mock;
    forgetRegisteredPushToken: jest.Mock;
  };

type FakeClient = ReturnType<typeof buildFakeSupabase> & {
  auth: {
    getSession: jest.Mock;
    onAuthStateChange: jest.Mock;
    signOut: jest.Mock;
  };
};

let client: FakeClient;
let queryClient: QueryClient;

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

// The real tree mounts the provider *inside* PersistQueryClientProvider
// (`app/_layout.tsx`), so a QueryClient is always above it.
function renderWithConsumers(ids: string[]) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SupabaseProvider>
        {ids.map((id) => (
          <Consumer key={id} id={id} />
        ))}
      </SupabaseProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const key of Object.keys(seen)) delete seen[key];
  client = buildFakeSupabase() as FakeClient;
  createClient.mockReturnValue(client);
  queryClient = makeQueryClient();
  asyncStoragePersister.removeClient.mockClear();
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

  // Signing out drops the session, but the cache it left behind is a copy of
  // somebody's group: every member's name, their habits and a week of
  // check-ins, sitting in AsyncStorage for the next person to hold the phone.
  // Nothing used to clear it — not sign-out, and not `delete_my_account`, which
  // reaches this same signOut.
  it("empties the query cache on signOut", async () => {
    renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    queryClient.setQueryData(queryKeys.profile("user-1"), {
      full_name: "Alice",
      avatar_url: null,
    });
    queryClient.setQueryData(queryKeys.groupMembers("group-1"), [
      { user_id: "user-2", full_name: "Bob", goals: [] },
    ]);

    await act(async () => {
      await seen.a.signOut();
    });

    expect(
      queryClient.getQueryData(queryKeys.profile("user-1")),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(queryKeys.groupMembers("group-1")),
    ).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("drops the persisted copy of the cache on signOut", async () => {
    renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await seen.a.signOut();
    });

    // Clearing memory is not enough on its own: the persister rehydrates from
    // AsyncStorage on the next launch.
    expect(asyncStoragePersister.removeClient).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes when the provider unmounts", async () => {
    const view = renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    view.unmount();

    expect(unsubscribeSpy()).toHaveBeenCalledTimes(1);
  });
});

// A signed-out phone that keeps its row in `device_push_tokens` keeps receiving
// the previous account's nudges — on the lock screen of whoever is holding it.
// The row has to go while the JWT that authorises the delete is still valid,
// which means before `auth.signOut()`, not after.
describe("SupabaseProvider — push token cleanup on sign-out", () => {
  const TOKEN = "ExponentPushToken[device]";
  let tokenQuery: ReturnType<typeof makeQueryBuilder>;

  beforeEach(() => {
    tokenQuery = makeQueryBuilder({ error: null });
    client = buildFakeSupabase({
      fromImpl: jest.fn(() => tokenQuery),
    }) as FakeClient;
    createClient.mockReturnValue(client);
    getRegisteredPushToken.mockReturnValue(TOKEN);
    forgetRegisteredPushToken.mockClear();
  });

  it("deletes this device's row before dropping the session", async () => {
    renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await seen.a.signOut();
    });

    expect(client.from).toHaveBeenCalledWith("device_push_tokens");
    expect(tokenQuery.delete).toHaveBeenCalled();
    // By token, not by user: deleting every row for this user would silence
    // their other phones too.
    expect(tokenQuery.eq).toHaveBeenCalledWith("expo_push_token", TOKEN);
    expect(
      (client.from as unknown as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan(client.auth.signOut.mock.invocationCallOrder[0]);
  });

  it("forgets the token once its row is gone", async () => {
    renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await seen.a.signOut();
    });

    expect(forgetRegisteredPushToken).toHaveBeenCalled();
  });

  it("touches nothing when this device never registered", async () => {
    getRegisteredPushToken.mockReturnValue(null);
    renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await seen.a.signOut();
    });

    expect(client.from).not.toHaveBeenCalled();
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("signs out anyway when the delete rejects", async () => {
    // Offline, or on an expired JWT. A user who has committed to leaving must
    // not be held in the session by a failed cleanup — the orphaned row is
    // reassigned by `register_push_token` the next time anyone signs in here.
    client.from = jest.fn(() => {
      throw new Error("offline");
    }) as unknown as typeof client.from;
    renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await expect(seen.a.signOut()).resolves.toBeUndefined();
    });

    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(seen.a.session).toBeNull();
  });

  it("signs out anyway when the delete comes back with an error", async () => {
    tokenQuery = makeQueryBuilder({ error: { message: "permission denied" } });
    renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await seen.a.signOut();
    });

    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(seen.a.session).toBeNull();
    // And the cache still goes: the reason sign-out clears it has nothing to do
    // with push.
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
