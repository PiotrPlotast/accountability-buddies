import { render, fireEvent, waitFor } from "@testing-library/react-native";
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

  it("renders nothing off iOS", () => {
    // expo-apple-authentication is iOS-only, and an "or" divider with no
    // second option under it is worse than no divider.
    Object.defineProperty(Platform, "OS", {
      value: "android",
      configurable: true,
    });
    const { Wrapper } = setup();

    const { queryByText } = render(<AppleAuth onError={jest.fn()} />, {
      wrapper: Wrapper,
    });

    expect(queryByText("Sign in with Apple")).toBeNull();
    expect(queryByText("or")).toBeNull();
  });

  it("renders the divider and the button on iOS", () => {
    const { Wrapper } = setup();

    const { getByText } = render(<AppleAuth onError={jest.fn()} />, {
      wrapper: Wrapper,
    });

    expect(getByText("or")).toBeTruthy();
    expect(getByText("Sign in with Apple")).toBeTruthy();
  });

  it("takes the wording from the screen it sits on", () => {
    const { Wrapper } = setup();

    const { getByText } = render(
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

    const { getByText } = render(<AppleAuth onError={jest.fn()} />, {
      wrapper: Wrapper,
    });
    fireEvent.press(getByText("Sign in with Apple"));

    await waitFor(() => {
      expect(supabase.auth.signInWithIdToken).toHaveBeenCalled();
    });
  });

  it("reports a failure to the screen's error line", async () => {
    signInAsync.mockRejectedValue(new Error("Apple is having a day"));
    const onError = jest.fn();
    const { Wrapper } = setup();

    const { getByText } = render(<AppleAuth onError={onError} />, {
      wrapper: Wrapper,
    });
    fireEvent.press(getByText("Sign in with Apple"));

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

    const { getByText } = render(<AppleAuth onError={onError} />, {
      wrapper: Wrapper,
    });
    fireEvent.press(getByText("Sign in with Apple"));

    await waitFor(() => {
      expect(signInAsync).toHaveBeenCalled();
    });
    expect(onError).not.toHaveBeenCalledWith(expect.any(String));
  });

  it("clears a stale error before trying again", async () => {
    const onError = jest.fn();
    const { Wrapper } = setup();

    const { getByText } = render(<AppleAuth onError={onError} />, {
      wrapper: Wrapper,
    });
    fireEvent.press(getByText("Sign in with Apple"));

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

    const { getByText } = render(<AppleAuth onError={jest.fn()} />, {
      wrapper: Wrapper,
    });
    fireEvent.press(getByText("Sign in with Apple"));
    fireEvent.press(getByText("Sign in with Apple"));

    await waitFor(() => {
      expect(signInAsync).toHaveBeenCalledTimes(1);
    });
    release({ identityToken: "id-token" });
  });
});
