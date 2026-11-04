import { Alert, AppState, type AlertButton } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { onlineManager } from "@tanstack/react-query";

import { useUpdatePrompt } from "@/hooks/useUpdatePrompt";

jest.mock("@/lib/updates", () => ({
  fetchNewUpdate: jest.fn(),
  restartToApplyUpdate: jest.fn(),
}));

const { fetchNewUpdate, restartToApplyUpdate } = require("@/lib/updates") as {
  fetchNewUpdate: jest.Mock;
  restartToApplyUpdate: jest.Mock;
};

let alertSpy: jest.SpyInstance;
let addListenerSpy: jest.SpyInstance;
const remove = jest.fn();

/** Fires the AppState listener the hook registered. */
async function appState(state: string) {
  const handler = addListenerSpy.mock.calls[0][1];
  await act(async () => {
    handler(state);
  });
}

/** The buttons of the most recent Alert, by label. */
function button(label: string): AlertButton {
  const buttons = alertSpy.mock.calls.at(-1)[2] as AlertButton[];
  const found = buttons.find((b) => b.text === label);
  if (!found) throw new Error(`no "${label}" button`);
  return found;
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchNewUpdate.mockResolvedValue(null);
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  addListenerSpy = jest
    .spyOn(AppState, "addEventListener")
    .mockReturnValue({ remove } as never);
});
afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

describe("useUpdatePrompt", () => {
  it("offers a restart once an update has downloaded", async () => {
    fetchNewUpdate.mockResolvedValue("update-1");

    await renderHook(() => useUpdatePrompt(true));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0][0]).toBe("Update available");
    expect(alertSpy.mock.calls[0][1]).toBe(
      "Restart now to get the latest version.",
    );
    expect(
      (alertSpy.mock.calls[0][2] as AlertButton[]).map((b) => b.text),
    ).toEqual(["Later", "Restart"]);
  });

  it("says nothing when there is no update", async () => {
    await renderHook(() => useUpdatePrompt(true));

    await waitFor(() => expect(fetchNewUpdate).toHaveBeenCalledTimes(1));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("restarts the app on Restart", async () => {
    fetchNewUpdate.mockResolvedValue("update-1");
    await renderHook(() => useUpdatePrompt(true));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    button("Restart").onPress?.();

    expect(restartToApplyUpdate).toHaveBeenCalledTimes(1);
  });

  it("leaves the app running on Later", async () => {
    fetchNewUpdate.mockResolvedValue("update-1");
    await renderHook(() => useUpdatePrompt(true));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    button("Later").onPress?.();

    expect(restartToApplyUpdate).not.toHaveBeenCalled();
  });

  it("waits until enabled before checking", async () => {
    // The root layout passes `isAppReady`, so nothing prompts over the splash.
    const { rerender } = await renderHook(
      ({ enabled }: { enabled: boolean }) => useUpdatePrompt(enabled),
      { initialProps: { enabled: false } },
    );
    expect(fetchNewUpdate).not.toHaveBeenCalled();

    await rerender({ enabled: true });

    await waitFor(() => expect(fetchNewUpdate).toHaveBeenCalledTimes(1));
  });

  it("checks again when the app returns to the foreground", async () => {
    await renderHook(() => useUpdatePrompt(true));
    await waitFor(() => expect(fetchNewUpdate).toHaveBeenCalledTimes(1));

    fetchNewUpdate.mockResolvedValue("update-1");
    await appState("active");

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(fetchNewUpdate).toHaveBeenCalledTimes(2);
  });

  it("does not check when the app goes to the background", async () => {
    await renderHook(() => useUpdatePrompt(true));
    await waitFor(() => expect(fetchNewUpdate).toHaveBeenCalledTimes(1));

    await appState("background");
    await appState("inactive");

    expect(fetchNewUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not ask again about an update already offered", async () => {
    // Later means later: it applies on the next cold start by itself.
    fetchNewUpdate.mockResolvedValue("update-1");
    await renderHook(() => useUpdatePrompt(true));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    button("Later").onPress?.();

    await appState("active");

    await waitFor(() => expect(fetchNewUpdate).toHaveBeenCalledTimes(2));
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it("asks about a newer update after Later", async () => {
    fetchNewUpdate.mockResolvedValue("update-1");
    await renderHook(() => useUpdatePrompt(true));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    button("Later").onPress?.();

    fetchNewUpdate.mockResolvedValue("update-2");
    await appState("active");

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2));
  });

  it("skips the check while offline", async () => {
    onlineManager.setOnline(false);

    await renderHook(() => useUpdatePrompt(true));
    await appState("active");

    expect(fetchNewUpdate).not.toHaveBeenCalled();
  });

  it("does not start a second check while one is in flight", async () => {
    let release: (id: string | null) => void = () => {};
    fetchNewUpdate.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await renderHook(() => useUpdatePrompt(true));

    await appState("active");
    expect(fetchNewUpdate).toHaveBeenCalledTimes(1);

    await act(async () => release("update-1"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
  });

  it("stops listening when unmounted", async () => {
    const { unmount } = await renderHook(() => useUpdatePrompt(true));

    await unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
