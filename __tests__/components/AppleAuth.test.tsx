import { act, render, fireEvent, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

import AppleAuth from "@/app/components/auth/AppleAuth";

import { buildFakeSupabase, buildWrapper } from "../test-utils/render";

const signInAsync = AppleAuthentication.signInAsync as jest.Mock;

function setup(supabase = buildFakeSupabase()) {
  const { Wrapper } = buildWrapper({ supabase });
  return { supabase, Wrapper };
}

describe("AppleAuth", () => {
  const realOS = Platform.OS;

  beforeEach(() => {
    signInAsync.mockReset();
    signInAsync.mockResolvedValue({ identityToken: "id-token" });
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      value: realOS,
      configurable: true,
    });
  });

  it("renders nothing off iOS", async () => {
    // expo-apple-authentication is iOS-only, and an "or" divider with no
    // second option under it is worse than no divider.
    Object.defineProperty(Platform, "OS", {
      value: "android",
      configurable: true,
    });
    const { Wrapper } = setup();

    const { queryByText } = await render(<AppleAuth onError={jest.fn()} />, {
      wrapper: Wrapper,
    });

    expect(queryByText("Sign in with Apple")).toBeNull();
    expect(queryByText("or")).toBeNull();
  });

  it("renders the divider and the button on iOS", async () => {
    const { Wrapper } = setup();

    const { getByText } = await render(<AppleAuth onError={jest.fn()} />, {
      wrapper: Wrapper,
    });

    expect(getByText("or")).toBeTruthy();
    expect(getByText("Sign in with Apple")).toBeTruthy();
  });

  it("takes the wording from the screen it sits on", async () => {
    const { Wrapper } = setup();

    const { getByText } = await render(
      <AppleAuth
        onError={jest.fn()}
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
      />,
      { wrapper: Wrapper },
    );

    expect(getByText("Sign up with Apple")).toBeTruthy();
  });

  it("signs in through Supabase when pressed", async () => {
    const { supabase, Wrapper } = setup();

    const { getByText } = await render(<AppleAuth onError={jest.fn()} />, {
      wrapper: Wrapper,
    });
    await fireEvent.press(getByText("Sign in with Apple"));

    await waitFor(() => {
      expect(supabase.auth.signInWithIdToken).toHaveBeenCalled();
    });
  });

  it("reports a failure to the screen's error line", async () => {
    signInAsync.mockRejectedValue(new Error("Apple is having a day"));
    const onError = jest.fn();
    const { Wrapper } = setup();

    const { getByText } = await render(<AppleAuth onError={onError} />, {
      wrapper: Wrapper,
    });
    await fireEvent.press(getByText("Sign in with Apple"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Apple is having a day");
    });
  });

  it("says nothing when the user backs out", async () => {
    signInAsync.mockRejectedValue(
      Object.assign(new Error("The user canceled the authorization attempt."), {
        code: "ERR_REQUEST_CANCELED",
      }),
    );
    const onError = jest.fn();
    const { Wrapper } = setup();

    const { getByText } = await render(<AppleAuth onError={onError} />, {
      wrapper: Wrapper,
    });
    await fireEvent.press(getByText("Sign in with Apple"));

    await waitFor(() => {
      expect(signInAsync).toHaveBeenCalled();
    });
    expect(onError).not.toHaveBeenCalledWith(expect.any(String));
  });

  it("clears a stale error before trying again", async () => {
    const onError = jest.fn();
    const { Wrapper } = setup();

    const { getByText } = await render(<AppleAuth onError={onError} />, {
      wrapper: Wrapper,
    });
    await fireEvent.press(getByText("Sign in with Apple"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(null);
    });
  });

  it("ignores a second press while the first is still in flight", async () => {
    let release: (v: unknown) => void = () => {};
    signInAsync.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { Wrapper } = setup();

    const { getByText } = await render(<AppleAuth onError={jest.fn()} />, {
      wrapper: Wrapper,
    });
    // Not awaited: RNTL 14's press waits for the handler, and this sign-in
    // stays in flight until `release` below.
    const firstPress = fireEvent.press(getByText("Sign in with Apple"));
    await waitFor(() => {
      expect(signInAsync).toHaveBeenCalledTimes(1);
    });
    await fireEvent.press(getByText("Sign in with Apple"));

    expect(signInAsync).toHaveBeenCalledTimes(1);
    release({ identityToken: "id-token" });
    await firstPress;
  });

  // Two taps landing in the same frame, before React has re-rendered: a
  // guard kept in state reads the old `false` for both and opens two Apple
  // sheets.
  it("ignores a second tap in the same frame as the first", async () => {
    let release: (v: unknown) => void = () => {};
    signInAsync.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { Wrapper } = setup();
    const { getByText } = await render(<AppleAuth onError={jest.fn()} />, {
      wrapper: Wrapper,
    });
    const button = getByText("Sign in with Apple");

    // Both taps inside one `act`, so React can't re-render between them. The
    // handler is called directly: two `fireEvent.press` calls in flight at
    // once would overlap two act scopes, which React doesn't support, and
    // the handler is the button's own `onPress`, reached through
    // test-renderer's fiber since RNTL 14 renders native elements only.
    let fiber = button.unstable_fiber;
    while (fiber && typeof fiber.memoizedProps?.onPress !== "function") {
      fiber = fiber.return;
    }
    const onPress = fiber?.memoizedProps.onPress as () => Promise<void>;
    let taps: Promise<void>[] = [];
    await act(async () => {
      taps = [onPress(), onPress()];
    });

    expect(signInAsync).toHaveBeenCalledTimes(1);
    release({ identityToken: "id-token" });
    await act(async () => {
      await Promise.all(taps);
    });
  });

  // The guard lifts as soon as an attempt settles, so a failed or cancelled
  // sign-in can be tried again straight away.
  it.each([
    ["failed", () => Promise.reject(new Error("Apple is down"))],
    ["was cancelled", () => Promise.reject({ code: "ERR_REQUEST_CANCELED" })],
  ])(
    "can be tried again at once after an attempt that %s",
    async (_label, first) => {
      signInAsync.mockImplementationOnce(first);
      const { Wrapper } = setup();
      const { getByText } = await render(<AppleAuth onError={jest.fn()} />, {
        wrapper: Wrapper,
      });

      await fireEvent.press(getByText("Sign in with Apple"));
      await waitFor(() => expect(signInAsync).toHaveBeenCalledTimes(1));
      // Let the first attempt settle.
      await act(async () => {});

      await fireEvent.press(getByText("Sign in with Apple"));
      await waitFor(() => expect(signInAsync).toHaveBeenCalledTimes(2));
    },
  );
});
