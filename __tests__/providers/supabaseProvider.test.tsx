import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { SupabaseContextValue } from "@/context/supabase-context";
import { useSupabase } from "@/hooks/useSupabase";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { secureSessionStorage } from "@/lib/sessionStorage";
import { getTodayLocalDate } from "@/lib/date";
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
  stopPushDelivery: jest.fn(() => Promise.resolve()),
}));

const { createClient } = require("@supabase/supabase-js") as {
  createClient: jest.Mock;
};

const { asyncStoragePersister } = require("@/lib/queryPersister") as {
  asyncStoragePersister: { removeClient: jest.Mock };
};

const { getRegisteredPushToken, forgetRegisteredPushToken, stopPushDelivery } =
  require("@/lib/push") as {
    getRegisteredPushToken: jest.Mock;
    forgetRegisteredPushToken: jest.Mock;
    stopPushDelivery: jest.Mock;
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

// Recording goes through a plain function: a component that writes to an
// outer object during render is exactly what the React Compiler rules flag.
const record = (id: string, value: SupabaseContextValue) => {
  seen[id] = value;
};

function Consumer({ id }: { id: string }) {
  record(id, useSupabase());
  return null;
}

// The real tree mounts the provider *inside* PersistQueryClientProvider
// (`app/_layout.tsx`), so a QueryClient is always above it.
async function renderWithConsumers(ids: string[]) {
  return await render(
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
  stopPushDelivery.mockClear();
});

describe("SupabaseProvider", () => {
  // The query layer owns retries. supabase-js retrying every read three times
  // inside each of TanStack's attempts is what kept an offline refresh
  // spinning for half a minute.
  it("turns off supabase-js's own read retries", async () => {
    await renderWithConsumers(["a"]);

    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    expect(createClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ db: { retry: false } }),
    );
  });

  // The refresh token is the account. AsyncStorage is a plain file that is in
  // the phone's backups, so the client is given `lib/sessionStorage.ts`.
  it("keeps the session in encrypted storage", async () => {
    await renderWithConsumers(["a"]);

    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    const options = createClient.mock.calls[0][2];
    expect(options.auth.storage).toBe(secureSessionStorage);
    expect(options.auth.persistSession).toBe(true);
  });

  // The whole point of moving session state out of `useSupabase`: it used to
  // run its own getSession + onAuthStateChange per call site, which on the
  // dashboard meant ~28 concurrent subscriptions.
  it("opens one auth subscription and one session lookup for the whole tree", async () => {
    await renderWithConsumers(["a", "b", "c", "d", "e"]);

    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(client.auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("hands every consumer the very same session object", async () => {
    await renderWithConsumers(["a", "b", "c"]);

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

    await renderWithConsumers(["a"]);

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

    await renderWithConsumers(["a"]);

    // A failed read means "signed out", never a splash that never lifts.
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));
    expect(seen.a.session).toBeNull();
  });

  it("pushes auth state changes to every consumer", async () => {
    await renderWithConsumers(["a", "b"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    const next = { user: { id: "user-2" } } as unknown as Session;
    await act(async () => {
      authCallback()("SIGNED_IN", next);
    });

    expect(seen.a.session?.user.id).toBe("user-2");
    expect(seen.b.session?.user.id).toBe("user-2");
  });

  it("clears the session for every consumer on signOut", async () => {
    await renderWithConsumers(["a", "b"]);
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

  // supabase-js defaults to `scope: 'global'`, which revokes every session the
  // account holds. The other phones then drop out on their next refresh without
  // ever running this signOut, so their `device_push_tokens` rows survive and
  // keep receiving this account's pushes while signed out.
  it("signs out this device only, not the account's other sessions", async () => {
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await seen.a.signOut();
    });

    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  // Signing out drops the session, but the cache it left behind is a copy of
  // somebody's group: every member's name, their habits and a week of
  // check-ins, sitting in AsyncStorage for the next person to hold the phone.
  // Nothing used to clear it — not sign-out, and not `delete_my_account`, which
  // reaches this same signOut.
  it("empties the query cache on signOut", async () => {
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    queryClient.setQueryData(queryKeys.profile("user-1"), {
      full_name: "Alice",
      avatar_url: null,
    });
    queryClient.setQueryData(
      queryKeys.groupMembers("group-1", getTodayLocalDate()),
      [{ user_id: "user-2", full_name: "Bob", goals: [] }],
    );

    await act(async () => {
      await seen.a.signOut();
    });

    expect(
      queryClient.getQueryData(queryKeys.profile("user-1")),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(
        queryKeys.groupMembers("group-1", getTodayLocalDate()),
      ),
    ).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("drops the persisted copy of the cache on signOut", async () => {
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await seen.a.signOut();
    });

    // Clearing memory is not enough on its own: the persister rehydrates from
    // AsyncStorage on the next launch.
    expect(asyncStoragePersister.removeClient).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes when the provider unmounts", async () => {
    const view = await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await view.unmount();

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
    await renderWithConsumers(["a"]);
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
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await seen.a.signOut();
    });

    expect(forgetRegisteredPushToken).toHaveBeenCalled();
  });

  it("touches nothing when this device never registered", async () => {
    getRegisteredPushToken.mockReturnValue(null);
    await renderWithConsumers(["a"]);
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
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await expect(seen.a.signOut()).resolves.toBeUndefined();
    });

    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(seen.a.session).toBeNull();
  });

  it("signs out anyway when the delete comes back with an error", async () => {
    tokenQuery = makeQueryBuilder({ error: { message: "permission denied" } });
    await renderWithConsumers(["a"]);
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

// Log out used to be the only thing that cleaned up, and only when it was
// online. A session that supabase-js gives up on (revoked from elsewhere, or a
// refresh token the server no longer accepts) arrives as a `SIGNED_OUT` event
// with nobody having pressed anything, and left the last account's group in
// the cache and its nudges arriving on the lock screen.
describe("SupabaseProvider — a session that ends without Log out", () => {
  const seedCache = () => {
    queryClient.setQueryData(queryKeys.profile("user-1"), {
      full_name: "Alice",
      avatar_url: null,
    });
    queryClient.setQueryData(
      queryKeys.groupMembers("group-1", getTodayLocalDate()),
      [{ user_id: "user-2", full_name: "Bob", goals: [] }],
    );
  };

  it("empties the cache and its persisted copy", async () => {
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));
    seedCache();

    await act(async () => {
      authCallback()("SIGNED_OUT", null);
    });

    expect(seen.a.session).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    await waitFor(() =>
      expect(asyncStoragePersister.removeClient).toHaveBeenCalledTimes(1),
    );
  });

  it("switches push delivery off on this phone", async () => {
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      authCallback()("SIGNED_OUT", null);
    });

    expect(stopPushDelivery).toHaveBeenCalledTimes(1);
  });

  // A refreshed token and a signed-out launch are not a session ending.
  it.each([
    ["TOKEN_REFRESHED", { user: { id: "user-1" } }],
    ["USER_UPDATED", { user: { id: "user-1" } }],
    ["INITIAL_SESSION", null],
  ])("leaves everything alone on %s", async (event, next) => {
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));
    seedCache();

    await act(async () => {
      authCallback()(event, next as unknown as Session | null);
    });

    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
    expect(asyncStoragePersister.removeClient).not.toHaveBeenCalled();
    expect(stopPushDelivery).not.toHaveBeenCalled();
  });

  it("survives the persisted copy failing to go", async () => {
    asyncStoragePersister.removeClient.mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));
    seedCache();

    await act(async () => {
      authCallback()("SIGNED_OUT", null);
    });

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(seen.a.session).toBeNull();
  });
});

describe("SupabaseProvider — Log out and push delivery", () => {
  it("switches push delivery off on this phone", async () => {
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await seen.a.signOut();
    });

    expect(stopPushDelivery).toHaveBeenCalledTimes(1);
  });

  // Offline, the row on the server cannot be deleted and supabase-js answers
  // with an error (it still drops the session on the phone). This is the case
  // the switch on the phone is for.
  it("does so offline too, and still ends signed out with an empty cache", async () => {
    getRegisteredPushToken.mockReturnValue("ExponentPushToken[device]");
    client.from = jest.fn(() => {
      throw new Error("Network request failed");
    }) as unknown as typeof client.from;
    client.auth.signOut.mockResolvedValue({
      error: { message: "Network request failed" },
    });
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));
    queryClient.setQueryData(queryKeys.profile("user-1"), { full_name: "A" });

    await act(async () => {
      await expect(seen.a.signOut()).resolves.toBeUndefined();
    });

    expect(stopPushDelivery).toHaveBeenCalledTimes(1);
    expect(seen.a.session).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(asyncStoragePersister.removeClient).toHaveBeenCalledTimes(1);
    getRegisteredPushToken.mockReturnValue(null);
  });

  // supabase-js reports its own sign-out as `SIGNED_OUT` as well. One Log out
  // is one clean-up.
  it("cleans up once when supabase-js echoes the sign-out", async () => {
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));
    client.auth.signOut.mockImplementation(async () => {
      authCallback()("SIGNED_OUT", null);
      return { error: null };
    });

    await act(async () => {
      await seen.a.signOut();
    });

    expect(asyncStoragePersister.removeClient).toHaveBeenCalledTimes(1);
    expect(stopPushDelivery).toHaveBeenCalledTimes(1);
  });

  // The flag that makes that so must not outlive the Log out it belongs to.
  it("still cleans up for a session that ends later by itself", async () => {
    await renderWithConsumers(["a"]);
    await waitFor(() => expect(seen.a.isLoaded).toBe(true));

    await act(async () => {
      await seen.a.signOut();
    });
    await act(async () => {
      authCallback()("SIGNED_IN", {
        user: { id: "user-2" },
      } as unknown as Session);
    });
    await act(async () => {
      authCallback()("SIGNED_OUT", null);
    });

    expect(stopPushDelivery).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(asyncStoragePersister.removeClient).toHaveBeenCalledTimes(2),
    );
  });
});
