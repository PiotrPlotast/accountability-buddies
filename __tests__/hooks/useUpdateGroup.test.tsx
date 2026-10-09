import { act } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useUpdateGroup } from "@/hooks/useUpdateGroup";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  renderHookWithSession,
} from "../test-utils/render";

async function renameWith(error: unknown) {
  const qb = makeQueryBuilder({ data: null, error } as never);
  const supabase = buildFakeSupabase({ fromImpl: jest.fn(() => qb) });
  const { Wrapper } = buildWrapper({ supabase });
  const utils = await renderHookWithSession(() => useUpdateGroup(), Wrapper);
  await act(async () => {
    await utils.result.current.value
      .mutateAsync({ groupId: "group-1", name: "Swole Mates" })
      .catch(() => {});
  });
}

describe("useUpdateGroup alerts", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it("asks for a connection when the rename never reached the server", async () => {
    await renameWith({
      message: "TypeError: Network request failed",
      details: "",
      hint: "",
      code: "",
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Update failed",
      "Check your connection and try again.",
    );
  });

  // PostgREST errors are plain objects, so `instanceof Error` threw their
  // message away and every refusal read as the generic line.
  it("shows the server's message for a refusal", async () => {
    await renameWith({ message: "Name too long", code: "23514" });

    expect(Alert.alert).toHaveBeenCalledWith("Update failed", "Name too long");
  });
});
