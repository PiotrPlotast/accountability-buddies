import { AppState } from "react-native";
import { waitFor } from "@testing-library/react-native";

import { usePushPermission } from "@/hooks/usePushPermission";

import {
  buildFakeSupabase,
  buildWrapper,
  renderHookWithSession,
} from "../test-utils/render";

jest.mock("@/lib/push", () => ({
  getPushPermissionStatus: jest.fn(),
}));
jest.mock("@/hooks/usePushRegistration", () => ({
  usePushRegistration: jest.fn(),
  registerAndStorePushToken: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getPushPermissionStatus } = require("@/lib/push") as {
  getPushPermissionStatus: jest.Mock;
};

const { registerAndStorePushToken } =
  require("@/hooks/usePushRegistration") as {
    registerAndStorePushToken: jest.Mock;
  };

const GRANTED = { granted: true, canAskAgain: false };
const DENIED = { granted: false, canAskAgain: false };

/** The listener the hook handed to AppState, and a way to fire it. */
function foreground() {
  const addListener = AppState.addEventListener as unknown as jest.Mock;
  const handler = addListener.mock.calls[0][1];
  handler("active");
}

let addListenerSpy: jest.SpyInstance;
const remove = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  getPushPermissionStatus.mockResolvedValue(GRANTED);
  addListenerSpy = jest
    .spyOn(AppState, "addEventListener")
    .mockReturnValue({ remove } as never);
});
afterEach(() => jest.restoreAllMocks());

async function renderIt() {
  const supabase = buildFakeSupabase();
  const { Wrapper } = buildWrapper({ supabase });
  const utils = await renderHookWithSession(() => usePushPermission(), Wrapper);
  return { supabase, utils };
}

describe("usePushPermission", () => {
  it("reports the current permission once it has been read", async () => {
    const { utils } = await renderIt();

    await waitFor(() => expect(utils.result.current.value).toEqual(GRANTED));
  });

  it("reports null until then", async () => {
    // "Not read yet" must not render as "blocked", the same distinction
    // `useNameGate` draws between `isResolved` and `needsName`.
    let release: (v: typeof GRANTED) => void;
    getPushPermissionStatus.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { utils } = await renderIt();

    expect(utils.result.current.value).toBeNull();
    release!(GRANTED);
    await waitFor(() => expect(utils.result.current.value).toEqual(GRANTED));
  });

  it("re-reads the permission when the app comes back to the foreground", async () => {
    // The only way back for a denied user is iOS Settings, which means leaving
    // the app — so returning is exactly when the answer can have changed.
    getPushPermissionStatus.mockResolvedValue(DENIED);
    const { utils } = await renderIt();
    await waitFor(() => expect(utils.result.current.value).toEqual(DENIED));

    getPushPermissionStatus.mockResolvedValue(GRANTED);
    foreground();

    await waitFor(() => expect(utils.result.current.value).toEqual(GRANTED));
  });

  it("registers a token when permission is newly granted", async () => {
    // Registration itself is keyed on the user id and will not run again this
    // launch, so without this the row says "allowed" and nothing can reach the
    // phone until the next cold start.
    getPushPermissionStatus.mockResolvedValue(DENIED);
    const { supabase, utils } = await renderIt();
    await waitFor(() => expect(utils.result.current.value).toEqual(DENIED));
    expect(registerAndStorePushToken).not.toHaveBeenCalled();

    getPushPermissionStatus.mockResolvedValue(GRANTED);
    foreground();

    await waitFor(() =>
      expect(registerAndStorePushToken).toHaveBeenCalledWith(supabase),
    );
  });

  it("does not register again for a permission that was already granted", async () => {
    // Coming back to the foreground is not consent; only the transition is.
    const { utils } = await renderIt();
    await waitFor(() => expect(utils.result.current.value).toEqual(GRANTED));

    foreground();

    await waitFor(() =>
      expect(getPushPermissionStatus).toHaveBeenCalledTimes(2),
    );
    expect(registerAndStorePushToken).not.toHaveBeenCalled();
  });

  it("stops listening when it unmounts", async () => {
    const { utils } = await renderIt();
    await waitFor(() => expect(addListenerSpy).toHaveBeenCalled());

    utils.unmount();

    expect(remove).toHaveBeenCalled();
  });
});
