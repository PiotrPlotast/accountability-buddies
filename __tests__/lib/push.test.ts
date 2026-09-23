import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import {
  SIMULATOR_PUSH_TOKEN,
  configureNotificationHandler,
  forgetRegisteredPushToken,
  getRegisteredPushToken,
  registerForPushNotificationsAsync,
} from "@/lib/push";

const getPermissions = Notifications.getPermissionsAsync as jest.Mock;
const requestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const getExpoToken = Notifications.getExpoPushTokenAsync as jest.Mock;
const setChannel = Notifications.setNotificationChannelAsync as jest.Mock;
const setHandler = Notifications.setNotificationHandler as jest.Mock;

const GRANTED = { status: "granted", granted: true, canAskAgain: false };
const DENIED = { status: "denied", granted: false, canAskAgain: false };
const UNDETERMINED = {
  status: "undetermined",
  granted: false,
  canAskAgain: true,
};

const DEVICE_TOKEN = "ExponentPushToken[device]";

beforeEach(() => {
  jest.clearAllMocks();
  forgetRegisteredPushToken();
  getPermissions.mockResolvedValue(GRANTED);
  requestPermissions.mockResolvedValue(GRANTED);
  getExpoToken.mockResolvedValue({ type: "expo", data: DEVICE_TOKEN });
  setChannel.mockResolvedValue(undefined);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

// `jest.replaceProperty` is undone by restoreAllMocks, not clearAllMocks —
// without this, Platform.OS stays "android" for every test after the Android
// one and `Device.isDevice` stays false after the simulator ones.
afterEach(() => {
  jest.restoreAllMocks();
});

describe("registerForPushNotificationsAsync — permission", () => {
  it("uses an existing grant without prompting a second time", async () => {
    const result = await registerForPushNotificationsAsync();

    expect(requestPermissions).not.toHaveBeenCalled();
    expect(result).toEqual({ token: DEVICE_TOKEN, status: "granted" });
  });

  it("asks for alerts, badges and sounds when the permission is undetermined", async () => {
    // Without the explicit `ios` block expo-notifications requests alerts
    // only, so a nudge would arrive silently and with no badge — which is the
    // one thing an accountability nudge cannot do.
    getPermissions.mockResolvedValue(UNDETERMINED);

    await registerForPushNotificationsAsync();

    expect(requestPermissions).toHaveBeenCalledWith({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
  });

  it("never asks Expo for a token when the user says no", async () => {
    getPermissions.mockResolvedValue(UNDETERMINED);
    requestPermissions.mockResolvedValue(DENIED);

    const result = await registerForPushNotificationsAsync();

    expect(result).toEqual({ token: null, status: "denied" });
    expect(getExpoToken).not.toHaveBeenCalled();
  });

  it("does not re-prompt someone who has already denied", async () => {
    // iOS shows the system prompt exactly once per install; asking again is a
    // no-op that resolves to the same denial. The route back is the Settings
    // deep link on the notification settings screen.
    getPermissions.mockResolvedValue(DENIED);

    const result = await registerForPushNotificationsAsync();

    expect(requestPermissions).not.toHaveBeenCalled();
    expect(result).toEqual({ token: null, status: "denied" });
  });
});

describe("registerForPushNotificationsAsync — the token", () => {
  it("passes the EAS project id to Expo", async () => {
    // A development build carries no project id of its own; without this the
    // call throws at runtime and the failure reads like a credentials problem.
    await registerForPushNotificationsAsync();

    expect(getExpoToken).toHaveBeenCalledWith({ projectId: "test-project-id" });
  });

  it("reports an error rather than throwing when Expo cannot issue a token", async () => {
    getExpoToken.mockRejectedValue(new Error("APNs unreachable"));

    await expect(registerForPushNotificationsAsync()).resolves.toEqual({
      token: null,
      status: "error",
    });
  });

  it("names the failure instead of swallowing it", async () => {
    // This is the only place the reason is ever visible. The status alone is
    // not diagnosable: on a device a missing `aps-environment` entitlement, an
    // APNs key not assigned to this bundle id and an unresolvable projectId all
    // produce the identical silent outcome — `registerAndStorePushToken`
    // returns early on the falsy token, and the settings screen shows nothing
    // because permission genuinely is granted.
    const thrown = new Error("no valid aps-environment entitlement string");
    getExpoToken.mockRejectedValue(thrown);

    await registerForPushNotificationsAsync();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("push token"),
      thrown,
    );
  });

  it("remembers the token so sign-out can delete its row", async () => {
    // The provider deletes this device's row *before* auth.signOut(), while it
    // still has a JWT, and the token is the only handle it has on that row.
    expect(getRegisteredPushToken()).toBeNull();

    await registerForPushNotificationsAsync();

    expect(getRegisteredPushToken()).toBe(DEVICE_TOKEN);
  });

  it("remembers nothing when no token was issued", async () => {
    getPermissions.mockResolvedValue(DENIED);

    await registerForPushNotificationsAsync();

    expect(getRegisteredPushToken()).toBeNull();
  });
});

describe("registerForPushNotificationsAsync — platforms", () => {
  it("creates the Android default channel before asking for anything", async () => {
    jest.replaceProperty(Platform, "OS", "android");

    await registerForPushNotificationsAsync();

    expect(setChannel).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({ name: "default" }),
    );
    // A missing enum member reads as `undefined`, and Android then files the
    // channel at its own default importance rather than the one asked for.
    const channel = setChannel.mock.calls[0][1];
    expect(typeof channel.importance).toBe("number");
  });

  it("creates no channel on iOS", async () => {
    expect(Platform.OS).toBe("ios");

    await registerForPushNotificationsAsync();

    expect(setChannel).not.toHaveBeenCalled();
  });

  it("stands a sentinel in for a simulator in development", async () => {
    // Keeps the whole registration path — the RPC, the settings screen, the
    // permission-denied UI — exercisable without a phone in hand. The
    // permission request still runs; only the token is faked.
    jest.replaceProperty(Device, "isDevice", false);

    const result = await registerForPushNotificationsAsync();

    expect(result).toEqual({ token: SIMULATOR_PUSH_TOKEN, status: "granted" });
    expect(getExpoToken).not.toHaveBeenCalled();
    expect(getPermissions).toHaveBeenCalled();
    expect(SIMULATOR_PUSH_TOKEN).toContain("SIMULATOR");
  });

  it("never hands a release build a sentinel token", async () => {
    // The sentinel is obviously fake in the database, which is only safe while
    // it cannot reach one from a shipped build.
    jest.replaceProperty(Device, "isDevice", false);
    jest.replaceProperty(
      globalThis as unknown as { __DEV__: boolean },
      "__DEV__",
      false,
    );

    const result = await registerForPushNotificationsAsync();

    expect(result).toEqual({ token: null, status: "unsupported" });
  });
});

describe("configureNotificationHandler", () => {
  it("shows a banner for a notification that arrives while the app is open", async () => {
    // Without a handler iOS suppresses foreground notifications entirely, so a
    // push sent while the app is open appears to vanish — a false failure that
    // is easy to misread in the simulator loop.
    configureNotificationHandler();

    const { handleNotification } = setHandler.mock.calls[0][0];
    await expect(handleNotification()).resolves.toEqual(
      expect.objectContaining({ shouldShowBanner: true }),
    );
  });
});
