import AsyncStorage from "@react-native-async-storage/async-storage";

// AsyncStorage's native module is null under Jest — the same local mock
// themeProvider.test.tsx and supabaseProvider.test.tsx use.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

// The id is cached in module scope, so every test needs a fresh copy of the
// module rather than a reset hook it would have to export for the tests alone.
function loadFresh(): typeof import("@/lib/deviceId") {
  let mod!: typeof import("@/lib/deviceId");
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@/lib/deviceId");
  });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  getItem.mockResolvedValue(null);
  setItem.mockResolvedValue(undefined);
});

describe("getDeviceId", () => {
  it("generates and stores an id the first time it is asked", async () => {
    const { getDeviceId } = loadFresh();

    const id = await getDeviceId();

    expect(id).toBeTruthy();
    expect(setItem).toHaveBeenCalledWith(expect.any(String), id);
  });

  it("reuses the stored id instead of minting a second one", async () => {
    // The whole point of the column: one row per install, stable across token
    // rotations. A new id on every launch would make it worthless.
    getItem.mockResolvedValue("stored-device-id");
    const { getDeviceId } = loadFresh();

    const id = await getDeviceId();

    expect(id).toBe("stored-device-id");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("reads storage once, however many callers ask", async () => {
    const { getDeviceId } = loadFresh();

    const [first, second] = await Promise.all([getDeviceId(), getDeviceId()]);

    expect(first).toBe(second);
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it("still yields an id when storage is unavailable", async () => {
    // Registration must not be lost because AsyncStorage failed — the id is a
    // debugging aid, and the token is what actually identifies the row.
    getItem.mockRejectedValue(new Error("storage gone"));
    const { getDeviceId } = loadFresh();

    await expect(getDeviceId()).resolves.toBeTruthy();
  });

  it("survives a failed write", async () => {
    setItem.mockRejectedValue(new Error("disk full"));
    const { getDeviceId } = loadFresh();

    const id = await getDeviceId();

    expect(id).toBeTruthy();
    // Cached in memory for the rest of the session, so at least this launch is
    // consistent.
    await expect(getDeviceId()).resolves.toBe(id);
  });
});
