import * as AppleAuthentication from "expo-apple-authentication";

import { useSupabase } from "@/hooks/useSupabase";
import { createAppleNonce } from "@/lib/appleNonce";

/** Apple's code for "the user dismissed the sheet". */
const CANCELLED = "ERR_REQUEST_CANCELED";

function isCancellation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === CANCELLED
  );
}

/**
 * Sign in with Apple.
 *
 * Deliberately Apple-specific rather than a shared `useOAuthSignIn`: the two
 * flows would only converge on the final `signInWithIdToken` line, and an
 * abstraction built from one example is a guess about a provider that may
 * never ship. Google is deferred, possibly indefinitely.
 *
 * `signInWithApple` resolves without doing anything when the user backs out of
 * the sheet — cancelling is a decision, not a failure, and a caller shouldn't
 * have to tell the two apart to avoid showing a red error. Everything else
 * throws.
 *
 * Only the email scope is requested. Apple hands over a name exactly once and
 * never again; this app asks everyone for a name on its own screen, so
 * collecting Apple's would gather a value that is never shown.
 */
export function useAppleSignIn() {
  const { supabase, isLoaded } = useSupabase();

  const signInWithApple = async () => {
    const nonce = await createAppleNonce();

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: nonce.hashed,
      });
    } catch (err) {
      if (isCancellation(err)) return;
      throw err;
    }

    if (!credential.identityToken) {
      throw new Error("Apple didn't return a sign-in token. Please try again.");
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: nonce.raw,
    });
    if (error) throw error;
    // On success the session guard swaps navigation groups; there is nothing
    // for the caller to navigate to.
  };

  return { isLoaded, signInWithApple };
}
