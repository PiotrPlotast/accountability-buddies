import { createContext } from "react";

import { SupabaseClient, Session } from "@supabase/supabase-js";

export type SupabaseContextValue = {
  supabase: SupabaseClient;
  session: Session | null;
  // False until the provider's first `getSession()` has resolved. `_layout`
  // holds the splash until this flips, so every other consumer mounts with the
  // session already known rather than racing its own lookup.
  isLoaded: boolean;
  signOut: () => Promise<void>;
};

export const SupabaseContext = createContext<SupabaseContextValue | null>(null);
