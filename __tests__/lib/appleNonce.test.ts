import * as Crypto from "expo-crypto";

import { createAppleNonce } from "@/lib/appleNonce";

describe("createAppleNonce", () => {
  beforeEach(() => {
    (Crypto.digestStringAsync as jest.Mock).mockClear();
  });

  it("hashes the raw nonce with SHA-256", async () => {
    const { raw, hashed } = await createAppleNonce();

    expect(Crypto.digestStringAsync).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      raw,
    );
    expect(hashed).toBe(`${Crypto.CryptoDigestAlgorithm.SHA256}:${raw}`);
  });

  it("returns two different values", async () => {
    // The whole point of the pair. If these ever collapse into one value the
    // handshake still "works" right up until Apple rejects it, and the error
    // it produces reads like a credentials problem.
    const { raw, hashed } = await createAppleNonce();

    expect(hashed).not.toBe(raw);
  });

  it("produces a raw nonce with real entropy", async () => {
    const { raw } = await createAppleNonce();

    expect(raw.length).toBeGreaterThanOrEqual(32);
    expect(raw).toMatch(/^[0-9a-f]+$/);
  });

  it("does not reuse a nonce between calls", async () => {
    const bytes = jest.mocked(Crypto.getRandomBytesAsync);
    bytes.mockResolvedValueOnce(Uint8Array.from([1, 2, 3, 4]));
    bytes.mockResolvedValueOnce(Uint8Array.from([5, 6, 7, 8]));

    const first = await createAppleNonce();
    const second = await createAppleNonce();

    expect(first.raw).not.toBe(second.raw);
  });
});
