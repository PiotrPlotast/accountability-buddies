import * as Crypto from "expo-crypto";

/**
 * The two halves of Sign in with Apple's replay protection.
 *
 * Apple takes the SHA-256 *hash* and embeds it in the identity token;
 * Supabase takes the *raw* value and hashes it itself to compare. Sending the
 * same value to both, or swapping them, fails with `invalid nonce` — an error
 * that reads like a credentials problem and sends you looking at the Apple
 * key, the bundle ID and the Services ID before the nonce.
 *
 * Its own module so `useAppleSignIn` reads as one obvious pairing, and so the
 * hashing can be pinned in a test instead of in a device build.
 */
export interface AppleNonce {
  /** Goes to Supabase, which hashes it and compares. */
  raw: string;
  /** Goes to Apple, which embeds it in the identity token. */
  hashed: string;
}

const NONCE_BYTES = 32;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createAppleNonce(): Promise<AppleNonce> {
  const raw = toHex(await Crypto.getRandomBytesAsync(NONCE_BYTES));
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
  );
  return { raw, hashed };
}
