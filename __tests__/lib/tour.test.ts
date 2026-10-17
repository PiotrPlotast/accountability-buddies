import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  TOUR_SLIDES,
  markTourSeenLocally,
  wasTourSeenLocally,
} from "@/lib/tour";

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe("the tour's local memory", () => {
  it("has not been seen by anyone on a fresh install", async () => {
    await expect(wasTourSeenLocally("user-1")).resolves.toBe(false);
  });

  it("remembers that this user finished it", async () => {
    await markTourSeenLocally("user-1");

    await expect(wasTourSeenLocally("user-1")).resolves.toBe(true);
  });

  it("is kept per account, so a second account on the phone still gets it", async () => {
    await markTourSeenLocally("user-1");

    await expect(wasTourSeenLocally("user-2")).resolves.toBe(false);
  });

  it("reads as unseen when storage fails, rather than throwing", async () => {
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("io"));

    await expect(wasTourSeenLocally("user-1")).resolves.toBe(false);
  });

  it("swallows a failed write", async () => {
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("io"));

    await expect(markTourSeenLocally("user-1")).resolves.toBeUndefined();
  });
});

describe("TOUR_SLIDES", () => {
  it("covers habits, editing them, buddies and nudges, reminders and the group streak, in that order", () => {
    expect(TOUR_SLIDES.map((s) => s.id)).toEqual([
      "habits",
      "manage",
      "buddies",
      "reminders",
      "streak",
    ]);
  });

  it("gives every slide a title, a body and a hint for its demo", () => {
    for (const slide of TOUR_SLIDES) {
      expect(slide.title).toBeTruthy();
      expect(slide.body).toBeTruthy();
      expect(slide.hint).toMatch(/^Try it: /);
    }
  });
});
