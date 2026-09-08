import { waitFor } from "@testing-library/react-native";

import { useNameGate } from "@/hooks/useNameGate";
import { ProfileRow } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  renderHookWithSession,
} from "../test-utils/render";

function wrapperFor(profile: ProfileRow | null) {
  const supabase = buildFakeSupabase({
    fromImpl: jest.fn(() => makeQueryBuilder({ data: profile, error: null })),
  });
  return buildWrapper({ supabase });
}

describe("useNameGate", () => {
  it("holds both answers back until the profile has been read", async () => {
    // A pending query must not report "no name" — that would flash the name
    // screen at every returning user with a cold cache.
    const never = new Promise(() => {});
    const qb = makeQueryBuilder({ data: null, error: null });
    qb.maybeSingle = jest.fn(() => never) as unknown as jest.Mock;
    const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
    const { Wrapper } = buildWrapper({ supabase });

    const utils = await renderHookWithSession(() => useNameGate(), Wrapper);

    expect(utils.result.current.value.isResolved).toBe(false);
    expect(utils.result.current.value.needsName).toBe(false);
  });

  it("asks for a name when the profile row has none", async () => {
    const { Wrapper } = wrapperFor({ full_name: null, avatar_url: null });

    const utils = await renderHookWithSession(() => useNameGate(), Wrapper);

    await waitFor(() => {
      expect(utils.result.current.value.isResolved).toBe(true);
    });
    expect(utils.result.current.value.needsName).toBe(true);
  });

  it("asks for a name when the stored name is only whitespace", async () => {
    const { Wrapper } = wrapperFor({ full_name: "   ", avatar_url: null });

    const utils = await renderHookWithSession(() => useNameGate(), Wrapper);

    await waitFor(() => {
      expect(utils.result.current.value.needsName).toBe(true);
    });
  });

  it("asks for a name when the profile row does not exist yet", async () => {
    const { Wrapper } = wrapperFor(null);

    const utils = await renderHookWithSession(() => useNameGate(), Wrapper);

    await waitFor(() => {
      expect(utils.result.current.value.isResolved).toBe(true);
    });
    expect(utils.result.current.value.needsName).toBe(true);
  });

  it("lets a named user straight through", async () => {
    const { Wrapper } = wrapperFor({ full_name: "Piotr", avatar_url: null });

    const utils = await renderHookWithSession(() => useNameGate(), Wrapper);

    await waitFor(() => {
      expect(utils.result.current.value.isResolved).toBe(true);
    });
    expect(utils.result.current.value.needsName).toBe(false);
  });
});
