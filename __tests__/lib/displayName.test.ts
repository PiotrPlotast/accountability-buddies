import {
  MAX_NAME_LENGTH,
  hasDisplayName,
  isValidName,
  normalizeName,
} from "@/lib/displayName";

describe("normalizeName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeName("  Piotr  ")).toBe("Piotr");
  });

  it("collapses runs of inner whitespace to a single space", () => {
    expect(normalizeName("Piotr   J   P")).toBe("Piotr J P");
  });

  it("returns an empty string for whitespace only", () => {
    expect(normalizeName("   \n\t ")).toBe("");
  });
});

describe("isValidName", () => {
  it("accepts an ordinary name", () => {
    expect(isValidName("Piotr")).toBe(true);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(isValidName("")).toBe(false);
    expect(isValidName("   ")).toBe(false);
  });

  it("accepts a name exactly at the maximum length", () => {
    expect(isValidName("x".repeat(MAX_NAME_LENGTH))).toBe(true);
  });

  it("rejects a name past the maximum length", () => {
    expect(isValidName("x".repeat(MAX_NAME_LENGTH + 1))).toBe(false);
  });

  it("measures the length after trimming, not before", () => {
    expect(isValidName(`  ${"x".repeat(MAX_NAME_LENGTH)}  `)).toBe(true);
  });
});

describe("hasDisplayName", () => {
  it("is false for a missing profile", () => {
    expect(hasDisplayName(null)).toBe(false);
    expect(hasDisplayName(undefined)).toBe(false);
  });

  it("is false for a null or whitespace-only name", () => {
    expect(hasDisplayName({ full_name: null })).toBe(false);
    expect(hasDisplayName({ full_name: "   " })).toBe(false);
  });

  it("is true once a real name is stored", () => {
    expect(hasDisplayName({ full_name: "Piotr" })).toBe(true);
  });
});
