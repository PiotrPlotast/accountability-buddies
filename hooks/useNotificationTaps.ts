import { useEffect, useState } from "react";
import { useRouter } from "expo-router";

import { useActiveGroup } from "@/hooks/useActiveGroup";
import { useNameGate } from "@/hooks/useNameGate";
import { useSupabase } from "@/hooks/useSupabase";
import { claimTap, emitShowMyTab } from "@/lib/notificationTaps";
import {
  NotificationTap,
  clearLastNotificationTap,
  getLastNotificationTap,
  onNotificationTap,
} from "@/lib/push";

/**
 * Routes a tapped notification. Mounted once, in `app/(protected)/_layout.tsx`,
 * so it only ever runs signed in.
 *
 * A nudge opens the dashboard on your own tab: it asks you to do your habits,
 * and the sender and their message are already on the notification. Every tap
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

    if (tap.data.type !== "nudge" || needsName || hasNoGroup) return;
    router.navigate("/");
    emitShowMyTab();
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
