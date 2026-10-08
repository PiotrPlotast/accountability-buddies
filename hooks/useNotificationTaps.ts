import { useEffect, useState } from "react";
import { useRouter } from "expo-router";

import { useActiveGroup } from "@/hooks/useActiveGroup";
import { useNameGate } from "@/hooks/useNameGate";
import { useSupabase } from "@/hooks/useSupabase";
import { claimTap, emitShowTab } from "@/lib/notificationTaps";
import {
  NotificationTap,
  clearLastNotificationTap,
  getLastNotificationTap,
  onNotificationTap,
} from "@/lib/push";

// Both ask you to do your habits, which only your own tab can.
const OWN_TAB_TYPES = new Set<unknown>(["nudge", "reminder"]);
// About a buddy, so their tab. The push names them in `buddy_id`.
const BUDDY_TAB_TYPES = new Set<unknown>([
  "buddy_ticked",
  "buddy_done",
  "member_joined",
]);

// Which tab a tap opens: `null` for your own, a member id for theirs, or
// `undefined` for none (the app just opens).
function tabFor(data: Record<string, unknown>): string | null | undefined {
  if (OWN_TAB_TYPES.has(data.type)) return null;
  if (BUDDY_TAB_TYPES.has(data.type) && typeof data.buddy_id === "string") {
    return data.buddy_id;
  }
  return undefined;
}

/**
 * Routes a tapped notification. Mounted once, in `app/(protected)/_layout.tsx`,
 * so it only ever runs signed in.
 *
 * A nudge or a habit reminder opens the dashboard on your own tab: both ask
 * you to do your habits, and what they say is already on the notification. A
 * buddy event (a tick, a closed day, a join) opens that buddy's tab. Every tap
 * marks its row read. A user still owed a name or a group stays where the
 * gates put them — finishing either lands on the dashboard anyway. Any other
 * type just opens the app.
 */
export function useNotificationTaps(): void {
  const { supabase } = useSupabase();
  const router = useRouter();
  const { isResolved, needsName } = useNameGate();
  const { loading: groupLoading, hasNoGroup } = useActiveGroup();

  // The launch tap is read once, on mount; later taps arrive by listener.
  const [tap, setTap] = useState<NotificationTap | null>(
    getLastNotificationTap,
  );
  useEffect(() => onNotificationTap(setTap), []);

  useEffect(() => {
    if (!tap || !isResolved) return;
    // Without a name the group doesn't matter: nothing is routed.
    if (!needsName && groupLoading) return;
    if (!claimTap(tap.id)) return;
    clearLastNotificationTap();

    const notificationId = tap.data.notification_id;
    if (typeof notificationId === "string") {
      // Best effort: a read receipt is not worth an Alert.
      void supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .then(
          () => {},
          () => {},
        );
    }

    const tab = tabFor(tap.data);
    if (tab === undefined || needsName || hasNoGroup) return;
    router.navigate("/");
    emitShowTab(tab);
  }, [tap, isResolved, needsName, groupLoading, hasNoGroup, router, supabase]);
}

/**
 * Drops any tap made while signed out — one left in the notification centre
 * from before sign-out. Signing out deletes this phone's token, so nothing new
 * arrives, and the old one is not replayed after the next sign-in. Mounted in
 * the root navigator, which is the only place that renders signed out.
 */
export function useForgetTapsWhileSignedOut(): void {
  const { isLoaded, session } = useSupabase();
  const signedOut = isLoaded && !session;

  useEffect(() => {
    if (!signedOut) return;
    const forget = (tap: NotificationTap | null) => {
      if (!tap) return;
      claimTap(tap.id);
      clearLastNotificationTap();
    };
    forget(getLastNotificationTap());
    return onNotificationTap(forget);
  }, [signedOut]);
}
