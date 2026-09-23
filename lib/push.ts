import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

/**
 * The only file allowed to import `expo-notifications`, the way `lib/haptics.ts`
 * is the only importer of `expo-haptics`. Three rules hold it together:
 *
 * 1. **Nothing here throws.** Registration runs from an effect on first paint,
 *    with no user action behind it, so every failure comes back as a `status`
 *    the caller can ignore or render. An Alert on a cold start would be about
 *    something the user never asked for.
 * 2. **The permission prompt is asked for once, by the OS.** `canAskAgain` is
 *    the whole condition — iOS shows the system prompt one time per install,
 *    and the route back for someone who declined is the Settings deep link on
 *    the notification settings screen, not a second prompt.
 * 3. **A token is remembered here, in module scope.** Sign-out has to delete
 *    this device's `device_push_tokens` row while its JWT is still valid, and
 *    the token is the only handle it has on that row.
 */

/**
 * Stands in for a real token on a simulator in development, so the whole
 * registration path — the RPC, the settings screen, the permission-denied
 * state — is exercisable without a phone in hand. It passes
 * `register_push_token`'s prefix check on purpose, and is recognisably fake in
 * the table. `__DEV__` keeps it out of anything shipped.
 */
export const SIMULATOR_PUSH_TOKEN = "ExponentPushToken[SIMULATOR]";

export type PushStatus = "granted" | "denied" | "unsupported" | "error";

export interface PushRegistration {
  token: string | null;
  status: PushStatus;
}

let registeredToken: string | null = null;

export const getRegisteredPushToken = (): string | null => registeredToken;

export const forgetRegisteredPushToken = (): void => {
  registeredToken = null;
};

/**
 * Without a handler iOS suppresses foreground notifications entirely, so a push
 * arriving while the app is open appears to vanish — a false failure that is
 * easy to misread in the simulator loop. Called at module scope from
 * `app/_layout.tsx`, alongside the splash-screen calls.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      // A badge on the app icon outlives the nudge it counted, and nothing
      // clears it yet.
      shouldSetBadge: false,
    }),
  });
}

// A development build carries no project id of its own; `expoConfig` is what
// `app.json`'s `extra.eas.projectId` resolves to at runtime.
function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

export interface PushPermission {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * The OS's current answer, without asking anything. The settings screen renders
 * it, and re-reads it whenever the app comes back to the foreground — the only
 * route back for someone who declined is iOS Settings, which means leaving.
 */
export async function getPushPermissionStatus(): Promise<PushPermission> {
  const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
  return { granted, canAskAgain };
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistration> {
  // A no-op elsewhere, but the guard documents that channels are an Android
  // concept — and Android files a notification at the channel's importance,
  // not the message's, so the channel has to exist before the first push.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    // The explicit `ios` block matters: the default request asks for alerts
    // only, and a nudge that arrives silent and unbadged is the one thing an
    // accountability nudge cannot be.
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    granted = asked.granted;
  }
  if (!granted) {
    return { token: null, status: "denied" };
  }

  // The permission above is real on a simulator; only the token is not.
  if (!Device.isDevice) {
    if (!__DEV__) {
      return { token: null, status: "unsupported" };
    }
    registeredToken = SIMULATOR_PUSH_TOKEN;
    return { token: SIMULATOR_PUSH_TOKEN, status: "granted" };
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId: getProjectId(),
    });
    registeredToken = data;
    return { token: data, status: "granted" };
  } catch (err) {
    // Named, not swallowed. This is the only place the reason is ever visible:
    // `registerAndStorePushToken` returns early on the falsy token without
    // logging, and the settings screen shows nothing because permission
    // genuinely is granted — so on a device a missing `aps-environment`
    // entitlement, an APNs key not assigned to this bundle id and an
    // unresolvable projectId otherwise produce the identical silent outcome.
    console.warn("Expo push token request failed:", err);
    return { token: null, status: "error" };
  }
}
