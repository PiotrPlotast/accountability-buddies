import { firstName, habitNudgeMessage, MAX_NUDGE_LENGTH } from "@/lib/nudge";

describe("firstName", () => {
  it("is the first word of a full name, the way the member tabs show it", () => {
    expect(firstName("Ada Lovelace")).toBe("Ada");
    expect(firstName("  Ada   Lovelace ")).toBe("Ada");
  });

  it("falls back to a neutral word for a blank name", () => {
    expect(firstName("")).toBe("your buddy");
    expect(firstName("   ")).toBe("your buddy");
  });
});

describe("habitNudgeMessage", () => {
  it("asks about the habit by name, lower-casing only its first letter", () => {
    expect(habitNudgeMessage("Ada", "Run")).toBe("Ada, what about your run?");
    expect(habitNudgeMessage("Ada", "Read Dune")).toBe(
      "Ada, what about your read Dune?",
    );
  });

  it("never prefills more than the 140 characters the box accepts", () => {
    expect(MAX_NUDGE_LENGTH).toBe(140);
    const message = habitNudgeMessage("Ada", "x".repeat(200));
    expect(message).toHaveLength(140);
    expect(message.startsWith("Ada, what about your x")).toBe(true);
  });
});
