import { Alert, AlertButton, Linking } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import NotificationSettingsScreen from "@/app/(protected)/notification-settings";
import { queryKeys } from "@/lib/queryKeys";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

// The global useTheme stub hands back a fresh object — and so a fresh
// `setHapticsEnabled` — on every render, which nothing can assert against.
const mockSetHapticsEnabled = jest.fn();
jest.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    accentId: "neon",
    accent: { id: "neon", hex: "#C6F94A", dim: "#8FB732", shades: [] },
    setAccent: jest.fn(),
    palette: [],
    hapticsEnabled: true,
    setHapticsEnabled: (v: boolean) => mockSetHapticsEnabled(v),
    hydrated: true,
  }),
}));

// The OS permission state, and the re-registration that follows a grant, are
// `usePushPermission`'s job and have their own suite.
jest.mock("@/hooks/usePushPermission", () => ({
  usePushPermission: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { usePushPermission } = require("@/hooks/usePushPermission") as {
  usePushPermission: jest.Mock;
};

const STORED = {
  reminders_enabled: true,
  nudges_enabled: true,
  social_enabled: false,
  timezone: "Europe/Warsaw",
  quiet_start: null,
  quiet_end: null,
};

function setup(
  permission: { granted: boolean; canAskAgain: boolean } | null = {
    granted: true,
    canAskAgain: false,
  },
) {
  usePushPermission.mockReturnValue(permission);
  const qb = makeQueryBuilder({ data: STORED, error: null });
  const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.notificationPrefs("user-1"), STORED);
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  return { qb, supabase, Wrapper };
}

/** Press a button by its label in the most recent `Alert.alert` call. */
function pressAlertButton(label: string) {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = calls[calls.length - 1][2] as AlertButton[];
  const button = buttons.find((b) => b.text === label);
  if (!button) {
    throw new Error(
      `No "${label}" button. Saw: ${buttons.map((b) => b.text).join(", ")}`,
    );
  }
  button.onPress?.();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest
    .spyOn(Linking, "openSettings")
    .mockImplementation(() => Promise.resolve());
});
afterEach(() => jest.restoreAllMocks());

describe("Notification settings — preferences", () => {
  it("shows each switch at its stored value", async () => {
    const { Wrapper } = setup();
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    await waitFor(() =>
      expect(getByLabelText("Reminders").props.value).toBe(true),
    );
    expect(getByLabelText("Nudges").props.value).toBe(true);
    expect(getByLabelText("Buddy activity").props.value).toBe(false);
  });

  it("writes the column behind the switch that moved", async () => {
    const { qb, Wrapper } = setup();
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    fireEvent(getByLabelText("Nudges"), "valueChange", false);

    await waitFor(() =>
      expect(qb.update).toHaveBeenCalledWith({ nudges_enabled: false }),
    );
  });

  it("turns a switch that was off back on", async () => {
    const { qb, Wrapper } = setup();
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    fireEvent(getByLabelText("Buddy activity"), "valueChange", true);

    await waitFor(() =>
      expect(qb.update).toHaveBeenCalledWith({ social_enabled: true }),
    );
  });
});

describe("Notification settings — the OS permission", () => {
  it("offers a way back when the system is blocking delivery", () => {
    // Someone who tapped "Don't Allow" once has no route back inside the app,
    // and the whole feature looks broken rather than switched off.
    const { Wrapper } = setup({ granted: false, canAskAgain: false });
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByLabelText("Open Settings"));

    expect(Linking.openSettings).toHaveBeenCalled();
  });

  it("says nothing about permission once it is granted", () => {
    const { Wrapper } = setup({ granted: true, canAskAgain: false });
    const { queryByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    expect(queryByLabelText("Open Settings")).toBeNull();
  });

  it("leaves the switches usable while permission is denied", async () => {
    // `notification_prefs` is per account, not per device: these switches also
    // govern the person's other phones, so a block here must not disable them.
    const { qb, Wrapper } = setup({ granted: false, canAskAgain: false });
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    fireEvent(getByLabelText("Nudges"), "valueChange", false);

    await waitFor(() =>
      expect(qb.update).toHaveBeenCalledWith({ nudges_enabled: false }),
    );
  });

  it("shows nothing either way until the permission has been read", () => {
    // `null` is "not asked yet", which must not render as "blocked" for the
    // frame before the check resolves.
    const { Wrapper } = setup(null);
    const { queryByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    expect(queryByLabelText("Open Settings")).toBeNull();
  });
});

describe("Notification settings — feedback and account", () => {
  it("carries the haptics switch, which is per device", () => {
    const { Wrapper } = setup();
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    fireEvent(getByLabelText("Haptics"), "valueChange", false);

    expect(mockSetHapticsEnabled).toHaveBeenCalledWith(false);
  });

  it("asks before signing out", () => {
    const { supabase, Wrapper } = setup();
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByLabelText("Log out"));

    expect(Alert.alert).toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("signs out once confirmed", async () => {
    const { supabase, Wrapper } = setup();
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByLabelText("Log out"));
    pressAlertButton("Log out");

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledTimes(1));
  });

  it("stays put when the sign-out is cancelled", () => {
    const { supabase, Wrapper } = setup();
    const { getByLabelText } = render(<NotificationSettingsScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByLabelText("Log out"));
    pressAlertButton("Cancel");

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });
});
