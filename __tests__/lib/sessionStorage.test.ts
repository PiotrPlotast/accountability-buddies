import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { secureSessionStorage } from "@/lib/sessionStorage";

const getKey = SecureStore.getItemAsync as jest.Mock;
const setKey = SecureStore.setItemAsync as jest.Mock;
const resetKeychain = (SecureStore as unknown as { __reset: () => void })
  .__reset;

// What supabase-js hands its storage: one JSON string under one key.
const KEY = "sb-project-auth-token";
const SESSION = JSON.stringify({
  access_token: "access-token-value",
  refresh_token: "refresh-token-value",
  user: { id: "user-1", user_metadata: { full_name: "Zoë Żółć 🏃" } },
});

/** Everything the keychain stand-in was asked to keep. */
const keychainWrites = (): string[] =>
  setKey.mock.calls.map(([, value]) => value as string);

beforeEach(async () => {
  jest.clearAllMocks();
  resetKeychain();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("secureSessionStorage", () => {
  // The point of the whole module: AsyncStorage is a plain file, and it is in
  // the phone's backups.
  it("leaves nothing readable in AsyncStorage", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);

    const atRest = await AsyncStorage.getItem(KEY);
    expect(atRest).not.toBeNull();
    expect(atRest).not.toContain("refresh-token-value");
    expect(atRest).not.toContain("access-token-value");
    expect(atRest).not.toContain("user-1");
  });

  it("reads back exactly what it stored, accents and emoji included", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);

    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
  });

  it("answers null for something never stored", async () => {
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  // A key is never reused, so a copy of an older stored value is no use
  // against the current key.
  it("makes a new key for every write", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    await secureSessionStorage.setItem(KEY, SESSION);

    const [first, second] = keychainWrites();
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
  });

  // "This device only" keeps the key out of backups and off a phone restored
  // from one; "after first unlock" lets a refresh run with the screen locked.
  it("keeps the key on this device only", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);

    expect(setKey).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      }),
    );
  });

  it("never puts the session itself in the keychain", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);

    for (const written of keychainWrites()) {
      expect(written).not.toContain("refresh-token-value");
      // The keychain takes small values; a whole session would not fit.
      expect(written.length).toBeLessThan(200);
    }
  });

  it("removes both halves", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    await secureSessionStorage.removeItem(KEY);

    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
    // Nothing left in the keychain either: the mock answers null for it.
    for (const [name] of setKey.mock.calls) {
      expect(await SecureStore.getItemAsync(name as string)).toBeNull();
    }
  });

  it("keeps separate values under separate keys", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    await secureSessionStorage.setItem(`${KEY}-code-verifier`, "verifier");

    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
    expect(await secureSessionStorage.getItem(`${KEY}-code-verifier`)).toBe(
      "verifier",
    );
  });
});

describe("secureSessionStorage — a session stored before encryption", () => {
  // Everyone signed in when this ships has their session in the clear. They
  // stay signed in, and the clear copy goes.
  it("hands it back and replaces the readable copy", async () => {
    await AsyncStorage.setItem(KEY, SESSION);

    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);

    const atRest = await AsyncStorage.getItem(KEY);
    expect(atRest).not.toContain("refresh-token-value");
    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
  });

  // Signed in is worth more than migrated: the next write tries again.
  it("still hands it back when the keychain refuses the move", async () => {
    await AsyncStorage.setItem(KEY, SESSION);
    setKey.mockRejectedValueOnce(new Error("keychain unavailable"));

    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
  });
});

describe("secureSessionStorage — when something is missing or wrong", () => {
  // A phone restored from a backup has the stored value and no key.
  it("answers null and clears the leftover when the key is gone", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    resetKeychain();

    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it("answers null when the stored value has been altered", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    const atRest = (await AsyncStorage.getItem(KEY)) as string;
    const flipped = atRest.endsWith("A") ? "B" : "A";
    await AsyncStorage.setItem(KEY, atRest.slice(0, -1) + flipped);

    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  // Before the first unlock after a restart the keychain cannot be read. That
  // is not a reason to throw the session away: answer "no session" for now
  // and leave what is stored for the next launch.
  it("keeps what is stored when the keychain cannot be read right now", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    getKey.mockRejectedValueOnce(new Error("device is locked"));

    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
    expect(await AsyncStorage.getItem(KEY)).not.toBeNull();
    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
  });

  // supabase-js saves the session in the middle of signing in; a throw here
  // would fail the sign-in. Without a key nothing may be stored at all, so the
  // session lives for this launch only.
  it("stores nothing, and does not throw, when the keychain refuses a write", async () => {
    setKey.mockRejectedValueOnce(new Error("keychain unavailable"));

    await expect(
      secureSessionStorage.setItem(KEY, SESSION),
    ).resolves.toBeUndefined();

    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it("does not leave an older session behind when a write is refused", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    setKey.mockRejectedValueOnce(new Error("keychain unavailable"));

    await secureSessionStorage.setItem(KEY, JSON.stringify({ newer: true }));

    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it("does not throw when removing fails", async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error("keychain unavailable"),
    );

    await expect(secureSessionStorage.removeItem(KEY)).resolves.toBeUndefined();
  });
});

describe("secureSessionStorage — on the web", () => {
  // There is no keychain in a browser. The web build keeps working as it did.
  it("stores and reads through AsyncStorage alone", async () => {
    jest.replaceProperty(Platform, "OS", "web");

    await secureSessionStorage.setItem(KEY, SESSION);

    expect(setKey).not.toHaveBeenCalled();
    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
    await secureSessionStorage.removeItem(KEY);
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });
});
