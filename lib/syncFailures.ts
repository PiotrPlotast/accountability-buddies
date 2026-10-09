import { Alert } from "react-native";

import { error as errorHaptic } from "@/lib/haptics";

/**
 * How long to wait after a queued change fails before saying so. A reconnect
 * replays the whole queue, and one refusal tends to come with others (every
 * tick from the day before, say), so they are gathered into one pop-up.
 */
export const SYNC_ALERT_DELAY_MS = 1500;

let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const lines = pending;
  pending = [];
  if (lines.length === 0) return;
  errorHaptic();
  Alert.alert(
    `${lines.length} ${lines.length === 1 ? "change" : "changes"} couldn't be saved`,
    lines.join("\n"),
  );
}

/**
 * A change made offline was refused when it finally synced. It has already
 * been undone on screen; this only tells the person, once per sync.
 */
export function reportSyncFailure(label: string, reason: string) {
  pending.push(`${label}: ${reason}`);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, SYNC_ALERT_DELAY_MS);
}
