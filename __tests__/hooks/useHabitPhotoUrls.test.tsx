import { waitFor } from "@testing-library/react-native";

import { useHabitPhotoUrls } from "@/hooks/useHabitPhotoUrls";

import {
  buildFakeSupabase,
  buildWrapper,
  renderHookWithSession,
} from "../test-utils/render";

describe("useHabitPhotoUrls", () => {
  it("signs every path in one call, for an hour, and maps path to URL", async () => {
    const supabase = buildFakeSupabase();
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useHabitPhotoUrls(["b.jpg", "a.jpg"]),
      Wrapper,
    );

    await waitFor(() =>
      expect(utils.result.current.value).toEqual({
        "a.jpg": "signed:a.jpg",
        "b.jpg": "signed:b.jpg",
      }),
    );
    expect(supabase.storage.from).toHaveBeenCalledWith("habit-photos");
    const bucket = (supabase.storage.from as jest.Mock).mock.results[0].value;
    expect(bucket.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(bucket.createSignedUrls).toHaveBeenCalledWith(
      ["a.jpg", "b.jpg"],
      3600,
    );
  });

  it("asks for nothing when there are no photos", async () => {
    const supabase = buildFakeSupabase();
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useHabitPhotoUrls([]),
      Wrapper,
    );

    expect(utils.result.current.value).toEqual({});
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  // A photo that expired between the read and the signing comes back with
  // its own error; the others still show.
  it("leaves out a path the server wouldn't sign", async () => {
    const createSignedUrls = jest.fn(() =>
      Promise.resolve({
        data: [
          { path: "a.jpg", signedUrl: "signed:a.jpg", error: null },
          { path: "b.jpg", signedUrl: null, error: "Object not found" },
        ],
        error: null,
      }),
    );
    const supabase = buildFakeSupabase({ storage: { createSignedUrls } });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useHabitPhotoUrls(["a.jpg", "b.jpg"]),
      Wrapper,
    );

    await waitFor(() =>
      expect(utils.result.current.value).toEqual({ "a.jpg": "signed:a.jpg" }),
    );
  });

  it("is empty, not an error screen, when signing fails", async () => {
    const createSignedUrls = jest.fn(() =>
      Promise.resolve({ data: null, error: { message: "offline" } }),
    );
    const supabase = buildFakeSupabase({ storage: { createSignedUrls } });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useHabitPhotoUrls(["a.jpg"]),
      Wrapper,
    );

    await waitFor(() => expect(createSignedUrls).toHaveBeenCalled());
    expect(utils.result.current.value).toEqual({});
  });
});
