import {
  DAY_CHEER_PRESETS,
  MAX_CHEER_LENGTH,
  cheerFromTap,
  habitCheerPresets,
} from "@/lib/cheer";

describe("cheer presets", () => {
  it("names the habit first, matching the server's default line", () => {
    const presets = habitCheerPresets("Read 20 pages");
    expect(presets[0]).toBe("Nice work on Read 20 pages!");
    expect(presets.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps every habit preset within the cap, however long the title", () => {
    for (const preset of habitCheerPresets("x".repeat(200))) {
      expect(preset.length).toBeLessThanOrEqual(MAX_CHEER_LENGTH);
    }
  });

  it("has day presets of its own, starting with the server's default line", () => {
    expect(DAY_CHEER_PRESETS[0]).toBe("What a day! Keep it going 🔥");
    expect(DAY_CHEER_PRESETS.length).toBeGreaterThanOrEqual(3);
    expect(habitCheerPresets("Run")).not.toEqual(
      expect.arrayContaining([...DAY_CHEER_PRESETS]),
    );
  });

  it("caps at the server's 140", () => {
    expect(MAX_CHEER_LENGTH).toBe(140);
  });
});

describe("cheerFromTap", () => {
  it("makes a habit cheer from a push about one habit", () => {
    expect(
      cheerFromTap({
        type: "buddy_ticked",
        buddy_id: "user-2",
        goal_id: "goal-1",
        goal_title: "Run",
        day: "2026-10-16",
      }),
    ).toEqual({
      buddyId: "user-2",
      goal: { id: "goal-1", title: "Run" },
      day: "2026-10-16",
    });
  });

  it("makes a day cheer from a push about several habits", () => {
    expect(
      cheerFromTap({
        type: "buddy_ticked",
        buddy_id: "user-2",
        day: "2026-10-16",
      }),
    ).toEqual({ buddyId: "user-2", goal: null, day: "2026-10-16" });
  });

  it("makes a day cheer from a closed-day push", () => {
    expect(
      cheerFromTap({
        type: "buddy_done",
        buddy_id: "user-2",
        day: "2026-10-16",
      }),
    ).toEqual({ buddyId: "user-2", goal: null, day: "2026-10-16" });
  });

  // Pushes sent before this release carry no day: the server then uses its
  // own today.
  it("leaves the day to the server when the push has none", () => {
    expect(cheerFromTap({ type: "buddy_done", buddy_id: "user-2" })).toEqual({
      buddyId: "user-2",
      goal: null,
      day: null,
    });
  });

  it("treats a habit id without its title as a day cheer", () => {
    expect(
      cheerFromTap({
        type: "buddy_ticked",
        buddy_id: "user-2",
        goal_id: "goal-1",
      }),
    ).toEqual({ buddyId: "user-2", goal: null, day: null });
  });

  it.each([
    [{ type: "member_joined", buddy_id: "user-2" }],
    [{ type: "nudge", sender_id: "user-2" }],
    [{ type: "cheer", sender_id: "user-2" }],
    [{ type: "reminder" }],
    [{ type: "buddy_done" }],
    [{ type: "buddy_ticked", buddy_id: 42 }],
  ])("offers no cheer for %j", (data) => {
    expect(cheerFromTap(data)).toBeNull();
  });
});
