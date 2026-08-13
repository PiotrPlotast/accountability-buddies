// Supabase auth errors arrive as `AuthError` with a terse `message`. A few of
// them are the ones users actually hit, and the raw wording is either jargon
// ("Invalid login credentials") or leaks implementation detail, so they get
// rewritten. Anything unrecognised falls through with its own message.
const MESSAGES: Record<string, string> = {
  "invalid login credentials": "That email and password don't match.",
  "email not confirmed": "Confirm your email address first, then sign in.",
  "user already registered":
    "That email already has an account. Sign in instead.",
  "token has expired or is invalid":
    "That code has expired. Request a new one.",
};

export function getAuthErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Something went wrong. Please try again.";

  return MESSAGES[raw.trim().toLowerCase()] ?? raw;
}
