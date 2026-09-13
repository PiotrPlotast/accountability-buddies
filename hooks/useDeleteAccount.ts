import { useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";

import { useSupabase } from "@/hooks/useSupabase";
import { destructive, error as errorBuzz } from "@/lib/haptics";

/**
 * Pull a readable reason out of whatever the mutation threw.
 *
 * A `PostgrestError` is a plain object, not an `Error`, so an `instanceof`
 * check alone reduces every server-side failure to "Please try again." — and
 * on a screen whose only other outcome is a deleted account, the actual reason
 * is the one diagnostic the user can read back.
 */
function messageFrom(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Please try again.";
}

/**
 * Delete the signed-in user's account, then sign them out.
 *
 * Not built on `lib/useOptimisticGoalMutation.ts`, and deliberately not
 * optimistic at all: there is no cache to patch on the way out, and a rollback
 * would have to un-delete an account. The RPC either finishes or nothing
 * happened — `delete_my_account` runs as one statement from the client's point
 * of view, so a half-deleted account is not a state this can land in.
 *
 * The sign-out is `onSuccess`, never before the call: the RPC identifies the
 * account from `auth.uid()`, and dropping the session first would leave it with
 * nobody to delete.
 */
export function useDeleteAccount() {
  const { supabase, session, signOut } = useSupabase();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("No user");

      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
    },
    // The buzz belongs to the confirming tap, not to the response — by the
    // time the response lands the account is gone.
    onMutate: () => {
      destructive();
    },
    onSuccess: async () => {
      // Clears the session, and the `Stack.Protected` guard in `_layout`
      // redirects out of `(protected)` on its own. Never navigate between
      // those groups directly.
      //
      // `auth.signOut()` talks to a server that has just forgotten this user,
      // so it may well answer with an error; supabase-js drops the local
      // session regardless, which is the part that matters here.
      await signOut();
    },
    onError: (err) => {
      errorBuzz();
      Alert.alert("Couldn't delete your account", messageFrom(err));
    },
  });
}
