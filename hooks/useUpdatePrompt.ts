import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import { onlineManager } from "@tanstack/react-query";

import { fetchNewUpdate, restartToApplyUpdate } from "@/lib/updates";

/**
 * Checks for an over-the-air update on launch and on every return to the
 * foreground, and offers a restart once one has downloaded. Mounted once, in
 * the root navigator, so it runs signed in or out; `enabled` is `isAppReady`,
 * so nothing prompts over the splash screen.
 *
 * Each update is offered once: Later leaves it to apply on the next cold start
 * by itself, and only a newer update asks again. Offline it doesn't ask the
 * server at all, and a check already running is not started twice.
 */
export function useUpdatePrompt(enabled: boolean): void {
  const checking = useRef(false);
  const offered = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;

    const check = async () => {
      if (checking.current || !onlineManager.isOnline()) return;
      checking.current = true;
      const id = await fetchNewUpdate();
      checking.current = false;
      if (!id || offered.current.has(id)) return;
      offered.current.add(id);
      Alert.alert(
        "Update available",
        "Restart now to get the latest version.",
        [
          { text: "Later", style: "cancel" },
          { text: "Restart", onPress: restartToApplyUpdate },
        ],
      );
    };

    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, [enabled]);
}
