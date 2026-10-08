import AsyncStorage from "@react-native-async-storage/async-storage";

import { GROUP_ICON_CHOICES, ICON_CHOICES } from "@/lib/habitIcons";
import {
  loadIconRecents,
  pushIconRecent,
  saveIconRecents,
  withSelectedIcon,
} from "@/lib/iconRecents";

// AsyncStorage is the library's in-memory mock, from jest.setup.js.

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getItem.mockResolvedValue(null);
  setItem.mockResolvedValue(undefined);
});

describe("pushIconRecent", () => {
  it("puts a new emoji at the front and drops the oldest", () => {
    const row = ["a", "b", "c"];
    expect(pushIconRecent(row, "z", 3)).toEqual(["z", "a", "b"]);
  });

  it("moves an emoji already in the row to the front without duplicating it", () => {
    expect(pushIconRecent(["a", "b", "c"], "c", 3)).toEqual(["c", "a", "b"]);
  });

  it("keeps the row at its length", () => {
    expect(pushIconRecent(ICON_CHOICES, "🦄")).toHaveLength(
      ICON_CHOICES.length,
    );
  });
});

describe("withSelectedIcon", () => {
  it("leaves the row alone when the selection is already in it", () => {
    expect(withSelectedIcon(["a", "b"], "b")).toEqual(["a", "b"]);
  });

  // A habit whose icon has dropped off this phone's recents (or was set on
  // another phone) must still show what it currently is.
  it("shows a selection that isn't in the row at the front", () => {
    expect(withSelectedIcon(["a", "b"], "🦄")).toEqual(["🦄", "a", "b"]);
  });

  it("leaves the row alone when nothing is selected", () => {
    expect(withSelectedIcon(["a", "b"], null)).toEqual(["a", "b"]);
  });
});

describe("loadIconRecents", () => {
  it("starts habits from the default habit set", async () => {
    await expect(loadIconRecents("habit")).resolves.toEqual(ICON_CHOICES);
  });

  it("starts groups from the default group set", async () => {
    await expect(loadIconRecents("group")).resolves.toEqual(GROUP_ICON_CHOICES);
  });

  it("returns what this phone stored", async () => {
    getItem.mockResolvedValue(JSON.stringify(["🦄", "🧘"]));
    await expect(loadIconRecents("habit")).resolves.toEqual(["🦄", "🧘"]);
  });

  it("keeps habits and groups under separate keys", async () => {
    await loadIconRecents("habit");
    await loadIconRecents("group");
    expect(getItem.mock.calls[0][0]).not.toBe(getItem.mock.calls[1][0]);
  });

  it.each([
    ["unparseable JSON", "{not json"],
    ["a non-array", JSON.stringify({ a: 1 })],
    ["an empty array", JSON.stringify([])],
    ["non-strings", JSON.stringify([1, 2])],
  ])("falls back to the defaults on %s", async (_label, stored) => {
    getItem.mockResolvedValue(stored);
    await expect(loadIconRecents("habit")).resolves.toEqual(ICON_CHOICES);
  });

  it("falls back to the defaults when storage fails", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    await expect(loadIconRecents("habit")).resolves.toEqual(ICON_CHOICES);
  });
});

describe("saveIconRecents", () => {
  it("stores the row as JSON under the same key it is loaded from", async () => {
    await saveIconRecents("group", ["🦄"]);
    getItem.mockResolvedValue(setItem.mock.calls[0][1]);
    await expect(loadIconRecents("group")).resolves.toEqual(["🦄"]);
    expect(setItem.mock.calls[0][0]).toBe(getItem.mock.calls[0][0]);
  });

  it("swallows a failed write", async () => {
    setItem.mockRejectedValue(new Error("boom"));
    await expect(saveIconRecents("habit", ["🦄"])).resolves.toBeUndefined();
  });
});
