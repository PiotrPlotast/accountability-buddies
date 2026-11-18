import {
  ReactNode,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import { createClient, processLock, Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";

import { SupabaseContext } from "@/context/supabase-context";
import { registerGoalMutationDefaults } from "@/lib/goalMutationDefaults";
import {
  forgetRegisteredPushToken,
  getRegisteredPushToken,
  stopPushDelivery,
} from "@/lib/push";
import { asyncStoragePersister } from "@/lib/queryPersister";
import { secureSessionStorage } from "@/lib/sessionStorage";

interface SupabaseProviderProps {
  children: ReactNode;
}

export const SupabaseProvider = ({ children }: SupabaseProviderProps) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

  const supabase = useMemo(
    () =>
      createClient(supabaseUrl, supabaseKey, {
        auth: {
          // Encrypted, with the key in the keychain: the refresh token is the
          // account, and AsyncStorage is a plain file that is in backups.
          storage: secureSessionStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          lock: processLock,
        },
        // TanStack Query owns retries (`lib/queryClient.ts`). Left on, every
        // read retried three times inside each of its attempts, and an
        // offline refresh spun for half a minute.
        db: { retry: false },
      }),
    [supabaseUrl, supabaseKey],
  );

  // The session lives here rather than in `useSupabase` so there is exactly one
  // lookup and one auth subscription for the whole tree. Held in the hook it
  // was per-call-site: ~28 concurrent subscriptions on the dashboard alone, and
  // every consumer started at `null` until its own lookup resolved.
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  // Always present: the root layout mounts PersistQueryClientProvider above
  // this one.
  const queryClient = useQueryClient();

  // Goal mutations run from defaults on the client, so a change queued
  // offline can be replayed after a restart with nothing but its key and
  // variables. Registered during the first render: the persisted cache is
  // restored from an effect of `PersistQueryClientProvider` above, which runs
  // after this, and a restored change with no default fails with "No
  // mutationFn found".
  useState(() => registerGoalMutationDefaults(queryClient, () => supabase));

  // What this phone still holds once a session has ended, however it ended.
  //
  // The cache is a copy of somebody's group: every member's name, their
  // habits, a week of check-ins, held in memory and mirrored into AsyncStorage
  // for 24h, with any changes still waiting to sync. Both copies go.
  //
  // Push delivery is switched off on the phone itself, not awaited: deleting
  // this device's `device_push_tokens` row needs a network and a valid
  // session, which a revoked session and an offline Log out don't have, and
  // the phone otherwise goes on showing the last account's nudges.
  const cleanUpAfterSession = useCallback(async () => {
    void stopPushDelivery();
    queryClient.clear();
    try {
      await asyncStoragePersister.removeClient();
    } catch {
      // Swallowed on purpose: a storage failure must not turn a completed
      // sign-out — or a completed account deletion — into an error the caller
      // reports to the user.
    }
  }, [queryClient]);

  // True while `signOut` below is running. supabase-js reports that sign-out
  // as `SIGNED_OUT` too, and one Log out is one clean-up.
  const signingOut = useRef(false);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      // A failed read means "signed out", never a stuck splash — `_layout`
      // waits on `isLoaded`, so it has to flip either way.
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoaded(true);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        // A session supabase-js gave up on by itself: revoked from somewhere
        // else, or a refresh token the server no longer accepts. Nobody
        // pressed Log out, so nothing else is going to clean up.
        if (event === "SIGNED_OUT" && !signingOut.current) {
          void cleanUpAfterSession();
        }
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase, cleanUpAfterSession]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => {
      subscription?.remove();
    };
  }, [supabase]);

  // Authoritative here in a way it never was in the hook, where `setSession`
  // only cleared the caller's own copy and the rest of the tree caught up via
  // `onAuthStateChange`.
  const signOut = useCallback(async () => {
    signingOut.current = true;
    try {
      // Before `auth.signOut()`, while the JWT that authorises the delete is
      // still valid. A signed-out phone that keeps its `device_push_tokens`
      // row keeps being sent the previous account's nudges. By token and not
      // by user, so the person's other phones stay registered.
      const pushToken = getRegisteredPushToken();
      if (pushToken) {
        try {
          await supabase
            .from("device_push_tokens")
            .delete()
            .eq("expo_push_token", pushToken);
        } catch {
          // Offline, or an expired JWT. Nobody gets held in a session they
          // have asked to leave over this: delivery is switched off on the
          // phone below, and `register_push_token` reassigns the orphaned row
          // the next time anyone signs in on this device.
        }
        forgetRegisteredPushToken();
      }

      // Local, not supabase-js's default `global`: a global sign-out revokes
      // the account's other phones too, and they drop out on their next
      // refresh without passing through here. Offline this answers with an
      // error and still drops the session on the phone, which is all that is
      // asked of it.
      await supabase.auth.signOut({ scope: "local" });
      setSession(null);
      // `useDeleteAccount` signs out through this same function, where
      // keeping a local copy of data the server has just deleted is the worse
      // half of the problem.
      await cleanUpAfterSession();
    } finally {
      signingOut.current = false;
    }
  }, [supabase, cleanUpAfterSession]);

  const value = useMemo(
    () => ({ supabase, session, isLoaded, signOut }),
    [supabase, session, isLoaded, signOut],
  );

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
};
