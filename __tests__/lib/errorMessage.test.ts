import { errorMessage, isNetworkError } from "@/lib/errorMessage";

// What supabase-js resolves `{ error }` with when fetch itself rejects: a
// plain object, not an `Error`, with the fetch error folded into `message`.
const offlinePostgrest = {
  message: "TypeError: Network request failed",
  details: "TypeError: Network request failed",
  hint: "",
  code: "",
};

describe("isNetworkError", () => {
  it.each([
    ["a PostgREST transport failure", offlinePostgrest],
    ["a bare fetch rejection", new TypeError("Network request failed")],
    ["a browser-style fetch rejection", new TypeError("Failed to fetch")],
    [
      "a functions fetch error",
      Object.assign(
        new Error("Failed to send a request to the Edge Function"),
        {
          name: "FunctionsFetchError",
        },
      ),
    ],
    [
      "an auth fetch error",
      Object.assign(new Error("fetch failed"), {
        name: "AuthRetryableFetchError",
      }),
    ],
  ])("recognises %s", (_label, err) => {
    expect(isNetworkError(err)).toBe(true);
  });

  it.each([
    ["a server refusal", { message: "duplicate key value", code: "23505" }],
    ["a plain Error", new Error("boom")],
    ["nothing", null],
  ])("does not treat %s as offline", (_label, err) => {
    expect(isNetworkError(err)).toBe(false);
  });
});

describe("errorMessage", () => {
  it("asks for a connection when the request never reached the server", () => {
    expect(errorMessage(offlinePostgrest)).toBe(
      "Check your connection and try again.",
    );
  });

  it("reads the message off a plain error object", () => {
    expect(
      errorMessage({ message: "duplicate key value", code: "23505" }),
    ).toBe("duplicate key value");
  });

  it("reads the message off an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it.each([
    ["an object with no message", {}],
    ["an empty message", { message: "  " }],
    ["a non-string message", { message: 42 }],
    ["null", null],
    ["a string", "something"],
  ])("falls back for %s, never [object Object]", (_label, err) => {
    expect(errorMessage(err)).toBe("Please try again.");
  });

  it("uses the caller's fallback when given one", () => {
    expect(errorMessage({}, "Could not save group changes.")).toBe(
      "Could not save group changes.",
    );
  });
});
