import { waitFor } from "@testing-library/react-native";

import { useDashboardData } from "@/hooks/useDashboardData";
import { ProfileRow } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
  renderHookWithSession,
} from "../test-utils/render";

// The mocked router instance lives on the expo-router module — see
// jest.setup.js. `require` because it is not part of the real module's
// type surface.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const router = require("expo-router").__router as { replace: jest.Mock };

/**
 * A user with no group. `profile` is what the `profiles` read resolves to, so
 * each test can decide whether the name has landed yet.
 */
function buildNoGroup(profile: ProfileRow | null) {
  const supabase = buildFakeSupabase({
    rpcImpl: jest.fn(() => makeQueryBuilder({ data: null, error: null })),
    fromImpl: jest.fn(() => makeQueryBuilder({ data: profile, error: null })),
  });
  return buildWrapper({ supabase, queryClient: makeQueryClient() });
}

describe("useDashboardData group gate", () => {
  beforeEach(() => {
    router.replace.mockClear();
  });

  it("sends a named user with no group to join-group", async () => {
    const { Wrapper } = buildNoGroup({ full_name: "Piotr", avatar_url: null });

    await renderHookWithSession(() => useDashboardData(), Wrapper);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/(protected)/join-group");
    });
  });

  it("stays put while the user still owes a name", async () => {
    // A brand new account has neither a name nor a group. The name gate owns
    // that user; racing it to join-group is the failure this guards.
    const { Wrapper } = buildNoGroup({ full_name: null, avatar_url: null });

    const utils = await renderHookWithSession(
      () => useDashboardData(),
      Wrapper,
    );

    await waitFor(() => {
      expect(utils.result.current.value.loading).toBe(false);
    });
    expect(router.replace).not.toHaveBeenCalled();
  });
});
