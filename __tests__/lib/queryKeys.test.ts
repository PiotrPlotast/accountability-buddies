import { queryKeys } from "@/lib/queryKeys";

describe("queryKeys", () => {
  it("groupStats includes the user id", () => {
    expect(queryKeys.groupStats("user-1")).toEqual(["groupStats", "user-1"]);
  });

  it("groupStats with undefined user keeps shape", () => {
    expect(queryKeys.groupStats(undefined)).toEqual(["groupStats", undefined]);
  });

  it("groupMembers includes the group id", () => {
    expect(queryKeys.groupMembers("group-1")).toEqual([
      "groupMembers",
      "group-1",
    ]);
  });

  it("groupMembers with null group keeps the slot", () => {
    // Mutations rely on this exact key shape — see CLAUDE.md.
    expect(queryKeys.groupMembers(null)).toEqual(["groupMembers", null]);
  });

  it("aggregate keys are prefix-only", () => {
    expect(queryKeys.groupStatsAll()).toEqual(["groupStats"]);
    expect(queryKeys.groupMembersAll()).toEqual(["groupMembers"]);
  });

  it("profile includes the user id", () => {
    expect(queryKeys.profile("u-9")).toEqual(["profile", "u-9"]);
  });
});
