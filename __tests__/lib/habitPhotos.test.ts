import {
  PHOTO_BUCKET,
  canAddPhoto,
  livePhoto,
  photoPath,
  photoSlotUsed,
  todaysPhotos,
} from "@/lib/habitPhotos";
import { Goal, HabitPhoto, Member } from "@/types/dashboardTypes";

const photo = (over: Partial<HabitPhoto> = {}): HabitPhoto => ({
  id: "p-1",
  path: "user-1/g-1/2026-11-03/a.jpg",
  createdAt: "2026-11-03T08:00:00Z",
  removed: false,
  ...over,
});

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g-1",
  title: "Run",
  user_id: "user-1",
  group_id: "group-1",
  completed_today: true,
  icon: "🏃",
  repeat_days: [],
  ...over,
});

describe("photoPath", () => {
  it("is <user>/<goal>/<day>/<id>.jpg, the shape attach_habit_photo checks", () => {
    expect(photoPath("user-1", "g-1", "2026-11-03", "abc")).toBe(
      "user-1/g-1/2026-11-03/abc.jpg",
    );
  });

  it("names the bucket the migration creates", () => {
    expect(PHOTO_BUCKET).toBe("habit-photos");
  });
});

describe("livePhoto", () => {
  it("is the photo while it hasn't been removed", () => {
    expect(livePhoto(goal({ photo: photo() }))).toEqual(photo());
  });

  it("is null once removed, and for a habit with none", () => {
    expect(livePhoto(goal({ photo: photo({ removed: true }) }))).toBeNull();
    expect(livePhoto(goal({ photo: null }))).toBeNull();
    // A habit cached before photos existed has no key at all.
    expect(livePhoto(goal())).toBeNull();
  });
});

describe("photoSlotUsed", () => {
  it("is true for a live photo and for a removed one: a photo is final", () => {
    expect(photoSlotUsed(goal({ photo: photo() }))).toBe(true);
    expect(photoSlotUsed(goal({ photo: photo({ removed: true }) }))).toBe(true);
  });

  it("is false with no photo today", () => {
    expect(photoSlotUsed(goal({ photo: null }))).toBe(false);
    expect(photoSlotUsed(goal())).toBe(false);
  });
});

describe("canAddPhoto", () => {
  it("is a ticked habit with its photo unused, online", () => {
    expect(canAddPhoto(goal(), true)).toBe(true);
  });

  it("is false offline", () => {
    expect(canAddPhoto(goal(), false)).toBe(false);
  });

  it("is false for an unticked habit: no tick, no photo", () => {
    expect(canAddPhoto(goal({ completed_today: false }), true)).toBe(false);
  });

  it("is false once the day's photo is used, even if it was removed", () => {
    expect(canAddPhoto(goal({ photo: photo() }), true)).toBe(false);
    expect(canAddPhoto(goal({ photo: photo({ removed: true }) }), true)).toBe(
      false,
    );
  });
});

describe("todaysPhotos", () => {
  const ada: Member = {
    user_id: "user-1",
    full_name: "Ada Lovelace",
    goals: [
      goal({
        id: "g-1",
        title: "Run",
        photo: photo({ id: "p-1", createdAt: "2026-11-03T08:00:00Z" }),
      }),
      goal({
        id: "g-2",
        title: "Read",
        photo: photo({ id: "p-2", removed: true }),
      }),
      goal({ id: "g-3", title: "Walk", photo: null }),
    ],
  };
  const bo: Member = {
    user_id: "user-2",
    full_name: "Bo",
    goals: [
      goal({
        id: "g-4",
        user_id: "user-2",
        title: "Swim",
        photo: photo({
          id: "p-4",
          path: "user-2/g-4/x.jpg",
          createdAt: "2026-11-03T09:30:00Z",
        }),
      }),
    ],
  };

  it("lists every live photo in the group, newest first, with its habit and member", () => {
    expect(todaysPhotos([ada, bo])).toEqual([
      {
        photo: expect.objectContaining({ id: "p-4" }),
        goal: expect.objectContaining({ id: "g-4", title: "Swim" }),
        member: { userId: "user-2", name: "Bo" },
      },
      {
        photo: expect.objectContaining({ id: "p-1" }),
        goal: expect.objectContaining({ id: "g-1", title: "Run" }),
        member: { userId: "user-1", name: "Ada Lovelace" },
      },
    ]);
  });

  it("is empty when nobody has posted", () => {
    expect(todaysPhotos([{ ...ada, goals: [goal({ photo: null })] }])).toEqual(
      [],
    );
    expect(todaysPhotos([])).toEqual([]);
  });
});
