import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { registerAndStorePushToken } from "@/hooks/usePushRegistration";
import { useSupabase } from "@/hooks/useSupabase";
import { getPushPermissionStatus, type PushPermission } from "@/lib/push";

/**
 * The OS permission state for the settings screen, kept fresh across the trip
 * to iOS Settings and back.
 *
 * `null` means "not read yet" and must not render as "blocked" — the same
 * distinction `useNameGate` draws between `isResolved` and `needsName`, and for
 * the same reason: the frame before the answer arrives would otherwise show
 * someone a warning about a permission they have.
 *
 * On the transition into granted it registers a token, because registration
 * itself is keyed on the user id and will not run again this launch. Without
 * that, the row flips to "allowed" while nothing can actually reach the phone
 * until the next cold start. Only the transition counts — returning to the
 * foreground is not consent.
 */
export function usePushPermission(): PushPermission | null {
  const { supabase } = useSupabase();
  const [permission, setPermission] = useState<PushPermission | null>(null);

  useEffect(() => {
    let cancelled = false;
    let wasGranted: boolean | null = null;

    const check = async () => {
      let next: PushPermission;
      try {
        next = await getPushPermissionStatus();
      } catch {
        // Nothing to show and nothing to do; the next foreground tries again.
        return;
      }
      if (cancelled) return;

      const previous = wasGranted;
      wasGranted = next.granted;
      setPermission(next);

      if (next.granted && previous === false) {
        void registerAndStorePushToken(supabase);
      }
    };

    void check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [supabase]);

  return permission;
}
