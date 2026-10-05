import { resolveViewedMemberId } from "@/lib/viewedMember";
import { Member } from "@/types/dashboardTypes";

const member = (user_id: string): Member => ({
  user_id,
  full_name: user_id,
  goals: [],
});

const ME = "me";
const members = [member("buddy"), member(ME), member("other")];

describe("resolveViewedMemberId", () => {
  it("keeps the selected tab while that member is still in the group", () => {
    expect(resolveViewedMemberId(members, "buddy", ME)).toBe("buddy");
  });

  it("opens on your own tab before anything is selected", () => {
    expect(resolveViewedMemberId(members, null, ME)).toBe(ME);
  });

  // The stuck-skeleton bug: the selection outlived the member, and nothing
  // ever moved it.
  it("falls back to your tab when the viewed member has left", () => {
    expect(
      resolveViewedMemberId([member(ME), member("other")], "buddy", ME),
    ).toBe(ME);
  });

  it("falls back to the first member when you are not in the list", () => {
    expect(
      resolveViewedMemberId([member("other"), member("x")], "buddy", ME),
    ).toBe("other");
  });

  it("is null when there are no members to show", () => {
    expect(resolveViewedMemberId([], "buddy", ME)).toBeNull();
    expect(resolveViewedMemberId([], null, undefined)).toBeNull();
  });
});
