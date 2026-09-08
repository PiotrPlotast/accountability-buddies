import { act, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useUpdateProfile } from "@/hooks/useUpdateProfile";
import { queryKeys } from "@/lib/queryKeys";
import { ProfileRow } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
  renderHookWithSession,
} from "../test-utils/render";

const existing: ProfileRow = { full_name: "Piotr", avatar_url: null };

describe("useUpdateProfile", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it("updates full_name on the signed-in user's own profile row", async () => {
    const qb = makeQueryBuilder({ data: [{ id: "user-1" }], error: null });
    const fromImpl = jest.fn(() => qb);
    const supabase = buildFakeSupabase({ fromImpl });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useUpdateProfile(),
      Wrapper,
    );

    await act(async () => {
      await utils.result.current.value.mutateAsync({ fullName: "  Zofia  " });
    });

    expect(fromImpl).toHaveBeenCalledWith("profiles");
    // Trimmed before it reaches the database, so the stored value and the
    // value the gate checks can never disagree.
    expect(qb.update).toHaveBeenCalledWith({ full_name: "Zofia" });
    expect(qb.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("writes the new name into the profile cache before the request settles", async () => {
    let resolveUpdate: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveUpdate = resolve;
    });
    const qb = makeQueryBuilder({ data: [{ id: "user-1" }], error: null });
    qb.select = jest.fn(() => pending) as unknown as jest.Mock;

    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
    const queryClient = makeQueryClient();
    queryClient.setQueryData(queryKeys.profile("user-1"), existing);
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(
      () => useUpdateProfile(),
      Wrapper,
    );

    act(() => {
      utils.result.current.value.mutate({ fullName: "Zofia" });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<ProfileRow>(queryKeys.profile("user-1"))
          ?.full_name,
      ).toBe("Zofia");
    });

    await act(async () => {
      resolveUpdate({ data: [{ id: "user-1" }], error: null });
      await pending;
    });
  });

  it("rolls the cache back and alerts when the update fails", async () => {
    const qb = makeQueryBuilder({ data: null, error: { message: "nope" } });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
    const queryClient = makeQueryClient();
    queryClient.setQueryData(queryKeys.profile("user-1"), existing);
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(
      () => useUpdateProfile(),
      Wrapper,
    );

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({ fullName: "Zofia" }),
      ).rejects.toBeTruthy();
    });

    expect(
      queryClient.getQueryData<ProfileRow>(queryKeys.profile("user-1")),
    ).toEqual(existing);
    expect(Alert.alert).toHaveBeenCalled();
  });

  it("fails loudly when the update matches no row", async () => {
    // `profiles` has no INSERT policy — the signup trigger owns the row. An
    // update that touches nothing means the row is missing, and silently
    // succeeding would let a nameless user past the gate.
    const qb = makeQueryBuilder({ data: [], error: null });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
    const queryClient = makeQueryClient();
    queryClient.setQueryData(queryKeys.profile("user-1"), existing);
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(
      () => useUpdateProfile(),
      Wrapper,
    );

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({ fullName: "Zofia" }),
      ).rejects.toBeTruthy();
    });

    expect(
      queryClient.getQueryData<ProfileRow>(queryKeys.profile("user-1")),
    ).toEqual(existing);
    expect(Alert.alert).toHaveBeenCalled();
  });

  it("rejects an invalid name without calling the database", async () => {
    const fromImpl = jest.fn(() =>
      makeQueryBuilder({ data: [{ id: "user-1" }], error: null }),
    );
    const supabase = buildFakeSupabase({ fromImpl });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(
      () => useUpdateProfile(),
      Wrapper,
    );

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({ fullName: "   " }),
      ).rejects.toBeTruthy();
    });

    expect(fromImpl).not.toHaveBeenCalled();
  });

  it("invalidates the profile query once the mutation settles", async () => {
    const qb = makeQueryBuilder({ data: [{ id: "user-1" }], error: null });
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
    const queryClient = makeQueryClient();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    const { Wrapper } = buildWrapper({ supabase, queryClient });

    const utils = await renderHookWithSession(
      () => useUpdateProfile(),
      Wrapper,
    );

    await act(async () => {
      await utils.result.current.value.mutateAsync({ fullName: "Zofia" });
    });

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.profile("user-1"),
      });
    });
  });
});
