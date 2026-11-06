import * as Updates from "expo-updates";

import { fetchNewUpdate, restartToApplyUpdate } from "@/lib/updates";

const checkForUpdateAsync = Updates.checkForUpdateAsync as jest.Mock;
const fetchUpdateAsync = Updates.fetchUpdateAsync as jest.Mock;
const reloadAsync = Updates.reloadAsync as jest.Mock;

const AVAILABLE = {
  isAvailable: true,
  manifest: { id: "update-1" },
  isRollBackToEmbedded: false,
  reason: undefined,
};
const FETCHED = {
  isNew: true,
  manifest: { id: "update-1" },
  isRollBackToEmbedded: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  checkForUpdateAsync.mockResolvedValue(AVAILABLE);
  fetchUpdateAsync.mockResolvedValue(FETCHED);
});
afterEach(() => jest.restoreAllMocks());

describe("fetchNewUpdate", () => {
  it("downloads an available update and returns its id", async () => {
    await expect(fetchNewUpdate()).resolves.toBe("update-1");
    expect(fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it("returns null without asking the server when updates are disabled", async () => {
    // A dev client or a build without an updates URL.
    jest.replaceProperty(Updates, "isEnabled", false);

    await expect(fetchNewUpdate()).resolves.toBeNull();
    expect(checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it("returns null and downloads nothing when no update is available", async () => {
    checkForUpdateAsync.mockResolvedValue({
      isAvailable: false,
      manifest: undefined,
      isRollBackToEmbedded: false,
      reason: "noUpdateAvailableOnServer",
    });

    await expect(fetchNewUpdate()).resolves.toBeNull();
    expect(fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it("returns null when the download turns out not to be new", async () => {
    fetchUpdateAsync.mockResolvedValue({
      isNew: false,
      manifest: undefined,
      isRollBackToEmbedded: false,
    });

    await expect(fetchNewUpdate()).resolves.toBeNull();
  });

  it("returns null instead of throwing when the check fails", async () => {
    // Offline, rate-limited, or development mode, where the call rejects.
    checkForUpdateAsync.mockRejectedValue(new Error("network"));

    await expect(fetchNewUpdate()).resolves.toBeNull();
  });

  it("returns null instead of throwing when the download fails", async () => {
    fetchUpdateAsync.mockRejectedValue(new Error("network"));

    await expect(fetchNewUpdate()).resolves.toBeNull();
  });
});

describe("restartToApplyUpdate", () => {
  it("reloads the app", () => {
    restartToApplyUpdate();

    expect(reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed reload", async () => {
    reloadAsync.mockRejectedValue(new Error("no runtime"));

    expect(() => restartToApplyUpdate()).not.toThrow();
    // Let the rejection settle: an unhandled one would fail the suite.
    await Promise.resolve();
  });
});
