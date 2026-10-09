import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/**
 * Feed the phone's own connection state into TanStack's `onlineManager`, which
 * pauses queries and queues mutations while it reads offline and resumes them
 * when it comes back. Without this it only ever learns from a failed fetch.
 *
 * Wi-Fi with nothing behind it (`isInternetReachable === false`) is offline;
 * `null` is "not checked yet" and stays online, or every launch would start by
 * queueing.
 */
export function startOnlineStatus() {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    }),
  );
}

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

/** Whether the app thinks it can reach the server right now. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline);
}
