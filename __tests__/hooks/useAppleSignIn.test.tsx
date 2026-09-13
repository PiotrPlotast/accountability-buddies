import { act } from "@testing-library/react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import { useAppleSignIn } from "@/hooks/useAppleSignIn";

import {
  buildFakeSupabase,
  buildWrapper,
  renderHookWithSession,
} from "../test-utils/render";

const signInAsync = AppleAuthentication.signInAsync as jest.Mock;

async function renderHook() {
  const supabase = buildFakeSupabase();
  const { Wrapper } = buildWrapper({ supabase });
  const utils = await renderHookWithSession(() => useAppleSignIn(), Wrapper);
  return { supabase, utils };
}

describe("useAppleSignIn", () => {
  beforeEach(() => {
    signInAsync.mockReset();
    signInAsync.mockResolvedValue({ identityToken: "id-token" });
  });

  it("gives Apple the hashed nonce and Supabase the raw one", async () => {
    // The single reason this hook is tested rather than left to a device
    // build. Swapping the two produces an `invalid nonce` from Supabase that
    // reads like a credentials problem, and no amount of retrying finds it.
    const { supabase, utils } = await renderHook();

    await act(async () => {
      await utils.result.current.value.signInWithApple();
    });

    const sentToApple = signInAsync.mock.calls[0][0].nonce;
    const sentToSupabase = (supabase.auth.signInWithIdToken as jest.Mock).mock
      .calls[0][0].nonce;

    expect(sentToApple).toBe(
      `${Crypto.CryptoDigestAlgorithm.SHA256}:${sentToSupabase}`,
    );
    expect(sentToApple).not.toBe(sentToSupabase);
  });

  it("asks for the email scope and nothing else", async () => {
    // Apple's name has nowhere to live — PR 1's name screen asks everyone —
    // so requesting FULL_NAME would collect a value the app never shows.
    const { utils } = await renderHook();

    await act(async () => {
      await utils.result.current.value.signInWithApple();
    });

    expect(signInAsync.mock.calls[0][0].requestedScopes).toEqual([
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ]);
  });

  it("exchanges the identity token with Supabase", async () => {
    const { supabase, utils } = await renderHook();

    await act(async () => {
      await utils.result.current.value.signInWithApple();
    });

    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "apple", token: "id-token" }),
    );
  });

  it("throws when Apple returns no identity token", async () => {
    signInAsync.mockResolvedValue({ identityToken: null });
    const { supabase, utils } = await renderHook();

    await act(async () => {
      await expect(
        utils.result.current.value.signInWithApple(),
      ).rejects.toThrow();
    });

    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it("resolves quietly when the user backs out of the Apple sheet", async () => {
    // Cancelling is a decision, not a failure. Throwing here would put a red
    // error under the form for someone who simply changed their mind.
    signInAsync.mockRejectedValue(
      Object.assign(new Error("The user canceled the authorization attempt."), {
        code: "ERR_REQUEST_CANCELED",
      }),
    );
    const { supabase, utils } = await renderHook();

    await act(async () => {
      await expect(
        utils.result.current.value.signInWithApple(),
      ).resolves.toBeUndefined();
    });

    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it("rethrows a real Apple failure", async () => {
    signInAsync.mockRejectedValue(
      Object.assign(new Error("Something went wrong"), {
        code: "ERR_INVALID_RESPONSE",
      }),
    );
    const { utils } = await renderHook();

    await act(async () => {
      await expect(
        utils.result.current.value.signInWithApple(),
      ).rejects.toThrow("Something went wrong");
    });
  });

  it("throws when Supabase rejects the token", async () => {
    const supabase = buildFakeSupabase();
    (supabase.auth.signInWithIdToken as jest.Mock).mockResolvedValue({
      error: new Error("Invalid nonce"),
    });
    const { Wrapper } = buildWrapper({ supabase });
    const utils = await renderHookWithSession(() => useAppleSignIn(), Wrapper);

    await act(async () => {
      await expect(
        utils.result.current.value.signInWithApple(),
      ).rejects.toThrow("Invalid nonce");
    });
  });
});
