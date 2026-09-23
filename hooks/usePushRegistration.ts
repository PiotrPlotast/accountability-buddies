import { useEffect } from "react";
import { Platform } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useSupabase } from "@/hooks/useSupabase";
import { getDeviceId } from "@/lib/deviceId";
import { registerForPushNotificationsAsync } from "@/lib/push";

/**
 * Get a token and hand it to `register_push_token`.
 *
 * Exported because `usePushPermission` needs the same path: someone who grants
 * permission in iOS Settings and comes back has no token, and the effect below
 * is keyed on the user id, so it will not run again this launch. The RPC
 * upserts on the token, so calling this twice is harmless.
 */
export async function registerAndStorePushToken(
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const { token } = await registerForPushNotificationsAsync();
    // No token means denied, a release build on a simulator, or Expo being
    // unreachable. All three are states the settings screen renders; none of
    // them is an error to interrupt anyone with here.
    if (!token) return;

    const { error } = await supabase.rpc("register_push_token", {
      p_token: token,
      p_device_id: await getDeviceId(),
      p_platform: Platform.OS,
    });
    if (error) {
      console.warn("Push token registration failed:", error.message);
    }
  } catch (err) {
    console.warn("Push registration failed:", err);
  }
}

/**
 * `notification_prefs.timezone` defaults to `UTC`, and E5's reminder cron
 * evaluates `now() at time zone timezone` for every row — so a row left at the
 * default fires someone's reminders at the wrong hour. This is the only place
 * that writes it, and it runs whatever the permission outcome: the row is per
 * account, so it has to be right even for a device that declined.
 *
 * Unconditional rather than read-then-write. It is one small UPDATE per launch,
 * against a read that would cost the same round trip, and it means the column
 * follows the person when they travel.
 */
async function syncTimezone(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("notification_prefs")
      .update({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      .eq("user_id", userId);
    if (error) {
      console.warn("Timezone sync failed:", error.message);
    }
  } catch (err) {
    console.warn("Timezone sync failed:", err);
  }
}

/**
 * Mount this in **exactly one place**: `app/(protected)/_layout.tsx`. It is the
 * right altitude — the layout only renders behind the session guard — and
 * mounting it twice would register the same device twice.
 *
 * Keyed on the user id rather than the session object, so a token refresh does
 * not re-register but an account switch does: the row has to move to its new
 * owner, or the previous user keeps receiving this phone's pushes. That
 * hand-over is why writes go through the `SECURITY DEFINER` RPC and not a
 * client upsert — no RLS policy keyed on `auth.uid()` can overwrite a row
 * somebody else still owns without also letting anyone steal any token.
 */
export function usePushRegistration(): void {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      await syncTimezone(supabase, userId);
      if (cancelled) return;
      await registerAndStorePushToken(supabase);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);
}
