import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

/**
 * A stable identifier for this *install*, written once and reused forever.
 *
 * It rides along with every `register_push_token` call as `p_device_id`.
 * Nothing on the backend reads it today — E4 selects tokens by `user_id` — but
 * an Expo push token can rotate, and this is the only value that survives that
 * rotation, so a later cleanup pass can tell "the same phone, re-registered"
 * from "a second phone".
 *
 * It is not a hardware id and deliberately cannot be one: it is generated
 * locally, scoped to AsyncStorage, and disappears when the app is uninstalled.
 */
const STORAGE_KEY = "device-id";

// One read per launch, and one in-flight promise: two callers arriving at the
// same time must not mint two ids and race each other's write.
let pending: Promise<string> | null = null;

async function resolveDeviceId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // Storage unavailable — fall through and mint one for this session rather
    // than losing the registration over a debugging aid.
  }

  const id = Crypto.randomUUID();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Same reasoning: the value is still useful for the life of this launch.
  }
  return id;
}

export function getDeviceId(): Promise<string> {
  pending ??= resolveDeviceId();
  return pending;
}
