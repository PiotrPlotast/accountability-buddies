import { Alert } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useMutation } from "@tanstack/react-query";

import * as haptics from "@/lib/haptics";
import { optimisticPatchOptions } from "@/lib/optimisticPatch";

import { buildWrapper } from "../test-utils/render";

type Row = { name: string; icon: string };

const KEY = ["row", "1"] as const;
const STORED: Row = { name: "Swole Mates", icon: "💪" };

function setup(mutationFn: (vars: Partial<Row>) => Promise<void>) {
  const { Wrapper, queryClient } = buildWrapper();
  queryClient.setQueryData(KEY, STORED);
  const invalidate = jest.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(
    () =>
      useMutation({
        mutationFn,
        ...optimisticPatchOptions<Row, Partial<Row>>({
          queryClient,
          queryKey: KEY,
          patch: (previous, vars) =>
            previous ? { ...previous, ...vars } : undefined,
          fallback: "Could not save that row.",
        }),
      }),
    { wrapper: Wrapper },
  );
  return { result, queryClient, invalidate };
}

let buzz: jest.SpyInstance;

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  buzz = jest.spyOn(haptics, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("optimisticPatchOptions", () => {
  it("patches the cache before the request settles", async () => {
    let finish!: () => void;
    const { result, queryClient } = setup(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );

    act(() => {
      result.current.mutate({ name: "Lift Club" });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(KEY)).toEqual({
        ...STORED,
        name: "Lift Club",
      }),
    );
    await act(async () => finish());
  });

  it("leaves the cache alone when the patch returns nothing", async () => {
    const { Wrapper, queryClient } = buildWrapper();
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => {},
          ...optimisticPatchOptions<Row, Partial<Row>>({
            queryClient,
            queryKey: KEY,
            patch: () => undefined,
          }),
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ name: "Lift Club" });
    });

    expect(queryClient.getQueryData(KEY)).toBeUndefined();
  });

  it("rolls back, buzzes and alerts with the shared title on failure", async () => {
    const { result, queryClient } = setup(() =>
      Promise.reject({ message: "Name too long", code: "23514" }),
    );

    await act(async () => {
      await result.current.mutateAsync({ name: "x" }).catch(() => {});
    });

    expect(queryClient.getQueryData(KEY)).toEqual(STORED);
    expect(buzz).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't save", "Name too long");
  });

  it("falls back to its own line when the error carries no message", async () => {
    const { result } = setup(() => Promise.reject({}));

    await act(async () => {
      await result.current.mutateAsync({ name: "x" }).catch(() => {});
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't save",
      "Could not save that row.",
    );
  });

  it("invalidates the key once the mutation settles", async () => {
    const { result, invalidate } = setup(async () => {});

    await act(async () => {
      await result.current.mutateAsync({ icon: "🏋️" });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });
});
