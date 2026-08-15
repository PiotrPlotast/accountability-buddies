import { ReactNode, useCallback, useMemo, useEffect, useState } from "react";
import { AppState } from "react-native";

import { createClient, processLock, Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SupabaseContext } from "@/context/supabase-context";

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
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          lock: processLock,
        },
      }),
    [supabaseUrl, supabaseKey],
  );

  // The session lives here rather than in `useSupabase` so there is exactly one
  // lookup and one auth subscription for the whole tree. Held in the hook it
  // was per-call-site: ~28 concurrent subscriptions on the dashboard alone, and
  // every consumer started at `null` until its own lookup resolved.
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

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
      (_event, newSession) => {
        setSession(newSession);
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

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
    await supabase.auth.signOut();
    setSession(null);
  }, [supabase]);

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
