import { getAuthErrorMessage } from "@/lib/authErrors";

describe("getAuthErrorMessage", () => {
  it("rewrites the known Supabase messages", () => {
    expect(getAuthErrorMessage(new Error("Invalid login credentials"))).toBe(
      "That email and password don't match.",
    );
  });

  it("matches regardless of casing or surrounding whitespace", () => {
    expect(getAuthErrorMessage(new Error("  EMAIL NOT CONFIRMED  "))).toBe(
      "Confirm your email address first, then sign in.",
    );
  });

  it("passes an unrecognised message through unchanged", () => {
    expect(getAuthErrorMessage(new Error("Rate limit exceeded"))).toBe(
      "Rate limit exceeded",
    );
  });

  it("falls back for non-Error throws", () => {
    expect(getAuthErrorMessage({ weird: true })).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("accepts a bare string", () => {
    expect(getAuthErrorMessage("Network request failed")).toBe(
      "Network request failed",
    );
  });
});
