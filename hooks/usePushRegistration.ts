import { useEffect } from "react";
import { Platform } from "react-native";

import { useSupabase } from "@/hooks/useSupabase";
import { getDeviceId } from "@/lib/deviceId";
import { registerForPushNotificationsAsync } from "@/lib/push";

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
      try {
        const { token } = await registerForPushNotificationsAsync();
        // No token means denied, a release build on a simulator, or Expo being
        // unreachable. All three are states the settings screen renders; none
        // of them is an error to interrupt anyone with here.
        if (!token || cancelled) return;

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
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);
}
