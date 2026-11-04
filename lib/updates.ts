import * as Updates from "expo-updates";

/**
 * The only file allowed to import `expo-updates`, the way `lib/push.ts` is the
 * only importer of `expo-notifications`. Over-the-air updates ship JavaScript
 * to builds already installed (TestFlight and later the App Store); anything
 * native still needs a new build, and the `fingerprint` runtime version in
 * `app.json` keeps an update from ever reaching a build it can't run on.
 *
 * **Nothing here throws.** The check runs on launch and on every return to the
 * foreground with no user action behind it, and it rejects in a dev client, in
 * development mode, offline and when Expo rate-limits it. Every one of those is
 * "no update", not an error worth showing anyone.
 */

/**
 * Asks the server for a newer update and downloads it. Resolves with the
 * downloaded update's id, which applies on the next cold start by itself or
 * at once through `restartToApplyUpdate`; `null` for no update or any failure.
 */
export async function fetchNewUpdate(): Promise<string | null> {
  if (!Updates.isEnabled) return null;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return null;
    const fetched = await Updates.fetchUpdateAsync();
    return fetched.isNew ? fetched.manifest.id : null;
  } catch {
    return null;
  }
}

/** Restarts the JS runtime on the downloaded update. Never throws. */
export function restartToApplyUpdate(): void {
  Updates.reloadAsync().catch(() => {});
}
