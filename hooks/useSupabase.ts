import { useContext } from "react";

import {
  SupabaseContext,
  SupabaseContextValue,
} from "@/context/supabase-context";

export const useSupabase = (): SupabaseContextValue => {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error("useSupabase must be used within a SupabaseProvider");
  }
  return ctx;
};
