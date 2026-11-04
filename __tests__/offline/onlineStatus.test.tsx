import NetInfo from "@react-native-community/netinfo";
import { act, renderHook } from "@testing-library/react-native";
import { onlineManager } from "@tanstack/react-query";

import { startOnlineStatus, useIsOnline } from "@/lib/onlineStatus";

const addEventListener = NetInfo.addEventListener as jest.Mock;

afterEach(() => {
  onlineManager.setOnline(true);
  addEventListener.mockClear();
});

/** Start listening and hand back the NetInfo callback the app registered. */
function start() {
  startOnlineStatus();
  const calls = addEventListener.mock.calls;
  return calls[calls.length - 1][0] as (state: object) => void;
}

describe("startOnlineStatus", () => {
  it("goes offline when the phone has no connection", async () => {
    const emit = start();
    await act(() => emit({ isConnected: false, isInternetReachable: false }));
    expect(onlineManager.isOnline()).toBe(false);
  });

  // Wi-Fi with no internet behind it (a captive portal) is offline too.
  it("goes offline when connected but the internet is unreachable", async () => {
    const emit = start();
    await act(() => emit({ isConnected: true, isInternetReachable: false }));
    expect(onlineManager.isOnline()).toBe(false);
  });

  // Reachability is `null` until the first check; that is not "offline".
  it("stays online while reachability is still unknown", async () => {
    const emit = start();
    await act(() => emit({ isConnected: true, isInternetReachable: null }));
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("comes back online with the connection", async () => {
    const emit = start();
    await act(() => emit({ isConnected: false, isInternetReachable: false }));
    await act(() => emit({ isConnected: true, isInternetReachable: true }));
    expect(onlineManager.isOnline()).toBe(true);
  });
});

describe("useIsOnline", () => {
  it("follows the online manager", async () => {
    const { result } = await renderHook(() => useIsOnline());
    expect(result.current).toBe(true);

    await act(() => onlineManager.setOnline(false));
    expect(result.current).toBe(false);

    await act(() => onlineManager.setOnline(true));
    expect(result.current).toBe(true);
  });
});
