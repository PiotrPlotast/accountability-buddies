import { queryKeys } from "@/lib/queryKeys";

describe("queryKeys", () => {
  it("groupStats includes the user id", () => {
    expect(queryKeys.groupStats("user-1")).toEqual(["groupStats", "user-1"]);
  });

  it("groupStats with undefined user keeps shape", () => {
    expect(queryKeys.groupStats(undefined)).toEqual(["groupStats", undefined]);
  });

  // The day is part of the key because "completed today" is an answer about
  // one day: keyed by group alone, yesterday's ticks outlived midnight.
  it("groupMembers includes the group id and the local day", () => {
    expect(queryKeys.groupMembers("group-1", "2026-10-05")).toEqual([
      "groupMembers",
      "group-1",
      "2026-10-05",
    ]);
  });

  it("groupMembers with null group keeps the slot", () => {
    // Mutations rely on this exact key shape — see CLAUDE.md.
    expect(queryKeys.groupMembers(null, "2026-10-05")).toEqual([
      "groupMembers",
      null,
      "2026-10-05",
    ]);
  });

  it("groupMembersOfGroup is the prefix of every day's key for that group", () => {
    expect(queryKeys.groupMembersOfGroup("group-1")).toEqual([
      "groupMembers",
      "group-1",
    ]);
    expect(queryKeys.groupMembers("group-1", "2026-10-05")).toEqual(
      expect.arrayContaining([...queryKeys.groupMembersOfGroup("group-1")]),
    );
  });

  it("aggregate keys are prefix-only", () => {
    expect(queryKeys.groupStatsAll()).toEqual(["groupStats"]);
    expect(queryKeys.groupMembersAll()).toEqual(["groupMembers"]);
  });

  it("profile includes the user id", () => {
    expect(queryKeys.profile("u-9")).toEqual(["profile", "u-9"]);
  });

  it("notificationPrefs includes the user id", () => {
    // Built through the helper rather than written inline at the call site,
    // unlike the `heatmap` precedent.
    expect(queryKeys.notificationPrefs("u-9")).toEqual([
      "notificationPrefs",
      "u-9",
    ]);
  });
});
