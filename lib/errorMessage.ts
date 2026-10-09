/**
 * What a failed request should say to a person.
 *
 * supabase-js resolves `{ error }` with a plain object, not an `Error`, so
 * `error instanceof Error ? error.message : String(error)` printed
 * "[object Object]" for every PostgREST refusal — and offline, where fetch
 * itself rejects, it folds that rejection into the same shape. Every
 * user-facing mutation alert reads its message through here.
 */

export const CONNECTION_MESSAGE = "Check your connection and try again.";

// The fetch rejection as each layer reports it: React Native's fetch, the
// browser's, and the names supabase-js gives its functions and auth wrappers.
const NETWORK_MESSAGE = /network request failed|failed to fetch|fetch failed/i;
const NETWORK_NAMES = new Set([
  "FunctionsFetchError",
  "AuthRetryableFetchError",
]);

function field(err: unknown, key: "message" | "name"): string | undefined {
  if (typeof err !== "object" || err === null || !(key in err)) return;
  const value = (err as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** The request never reached the server. */
export function isNetworkError(err: unknown): boolean {
  const name = field(err, "name");
  if (name && NETWORK_NAMES.has(name)) return true;
  const message = field(err, "message");
  return !!message && NETWORK_MESSAGE.test(message);
}

/**
 * The line for an alert: a connection hint when the request never left the
 * phone, the server's own message otherwise, and `fallback` when there is
 * nothing readable — never "[object Object]".
 */
export function errorMessage(
  err: unknown,
  fallback = "Please try again.",
): string {
  if (isNetworkError(err)) return CONNECTION_MESSAGE;
  const message = field(err, "message")?.trim();
  return message ? message : fallback;
}
