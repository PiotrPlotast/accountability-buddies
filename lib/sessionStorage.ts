import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/**
 * Where supabase-js keeps the session, and the only file allowed to import
 * `expo-secure-store`, the way `lib/push.ts` is the only importer of
 * `expo-notifications`.
 *
 * The session is the refresh token, and the refresh token is the account.
 * AsyncStorage is a plain file inside the app's sandbox and inside the phone's
 * backups, so the session is no longer written there as it is. It is too big
 * for the keychain (which takes about 2 KB), so it is split: the value is
 * encrypted with AES-GCM and the ciphertext goes to AsyncStorage, and the key
 * goes to the Keychain / Keystore. Either half alone is useless.
 *
 * Four rules hold it together:
 *
 * 1. **A new key for every write.** Nothing is ever encrypted twice under one
 *    key, and an older copy of the stored value cannot be read with the
 *    current key.
 * 2. **The key stays on this device.** `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`
 *    keeps it out of backups and off a phone restored from one (that phone
 *    asks for a sign-in), and still lets a token refresh run while the screen
 *    is locked.
 * 3. **Nothing here throws.** supabase-js saves the session in the middle of
 *    signing in. If the keychain refuses, nothing is stored at all (never the
 *    readable value as a fallback) and the session lasts for this launch.
 * 4. **A session stored before this existed is carried over**, so nobody is
 *    signed out by the update that brings it in.
 *
 * The web build has no keychain and keeps using AsyncStorage as it did.
 */

/** Marks a value this module wrote. A session stored before it is JSON. */
const SEALED_PREFIX = "aesgcm1:";

const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// The keychain takes letters, digits, ".", "-" and "_" in a name.
const keyName = (key: string) =>
  `session-key.${key.replace(/[^A-Za-z0-9._-]/g, "_")}`;

const hasKeychain = () => Platform.OS !== "web";

// Written out rather than `TextEncoder`/`TextDecoder`: the AES calls take
// bytes, and nothing guarantees both of those in every runtime this ships to.
function toUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const c = char.codePointAt(0) as number;
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      bytes.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function fromUtf8(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let c: number;
    if (b < 0x80) {
      c = b;
      i += 1;
    } else if (b < 0xe0) {
      c = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if (b < 0xf0) {
      c =
        ((b & 0x0f) << 12) |
        ((bytes[i + 1] & 0x3f) << 6) |
        (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      c =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      i += 4;
    }
    parts.push(String.fromCodePoint(c));
  }
  return parts.join("");
}

/**
 * Encrypts `value` under a new key and puts the key in the keychain. Resolves
 * with what belongs in AsyncStorage, or `null` when the keychain refused.
 */
async function seal(key: string, value: string): Promise<string | null> {
  try {
    const aesKey = await AESEncryptionKey.generate(AESKeySize.AES256);
    const sealed = await aesEncryptAsync(toUtf8(value), aesKey);
    await SecureStore.setItemAsync(
      keyName(key),
      await aesKey.encoded("base64"),
      KEY_OPTIONS,
    );
    return SEALED_PREFIX + (await sealed.combined("base64"));
  } catch {
    return null;
  }
}

/** Both halves, each on its own: one failing must not keep the other. */
async function discard(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Nothing to do about it here; the value is unreadable without its key.
  }
  try {
    await SecureStore.deleteItemAsync(keyName(key), KEY_OPTIONS);
  } catch {
    // Likewise: a key with no value to open is only a key.
  }
}

async function getItem(key: string): Promise<string | null> {
  if (!hasKeychain()) return AsyncStorage.getItem(key);

  let stored: string | null;
  try {
    stored = await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
  if (stored === null) return null;

  // Written before this module existed. Hand it back, so the person stays
  // signed in, and replace the readable copy. If the keychain refuses, the
  // next save tries again.
  if (!stored.startsWith(SEALED_PREFIX)) {
    const sealed = await seal(key, stored);
    if (sealed !== null) {
      try {
        await AsyncStorage.setItem(key, sealed);
      } catch {
        // Still readable at rest for now; still signed in.
      }
    }
    return stored;
  }

  let encodedKey: string | null;
  try {
    encodedKey = await SecureStore.getItemAsync(keyName(key), KEY_OPTIONS);
  } catch {
    // The keychain can't be read right now (before the first unlock after a
    // restart). No session for this launch, and nothing thrown away.
    return null;
  }

  // No key: a phone restored from a backup. What is stored can never be read.
  if (encodedKey === null) {
    await discard(key);
    return null;
  }

  try {
    const aesKey = await AESEncryptionKey.import(encodedKey, "base64");
    const plain = await aesDecryptAsync(
      AESSealedData.fromCombined(stored.slice(SEALED_PREFIX.length)),
      aesKey,
    );
    return fromUtf8(plain);
  } catch {
    // The wrong key, or a value that has been altered: unreadable for good.
    await discard(key);
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (!hasKeychain()) return AsyncStorage.setItem(key, value);

  const sealed = await seal(key, value);
  if (sealed === null) {
    // Never the readable value instead. And not the previous session either:
    // it has just been replaced.
    await discard(key);
    return;
  }
  try {
    await AsyncStorage.setItem(key, sealed);
  } catch {
    // The session lasts for this launch.
  }
}

async function removeItem(key: string): Promise<void> {
  if (!hasKeychain()) return AsyncStorage.removeItem(key);
  await discard(key);
}

/** The `auth.storage` the Supabase client is built with. */
export const secureSessionStorage = { getItem, setItem, removeItem };
