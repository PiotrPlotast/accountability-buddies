import { act } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useSendCheer } from "@/hooks/useSendCheer";
import * as haptics from "@/lib/haptics";

import {
  buildFakeSupabase,
  buildWrapper,
  renderHookWithSession,
} from "../test-utils/render";

async function renderSendCheer(functionsImpl: jest.Mock) {
  const supabase = buildFakeSupabase({ functionsImpl });
  const { Wrapper } = buildWrapper({ supabase });
  return renderHookWithSession(() => useSendCheer(), Wrapper);
}

const answer = (data: unknown, error: unknown = null) =>
  jest.fn(() => Promise.resolve({ data, error }));

describe("useSendCheer", () => {
  let celebrate: jest.SpyInstance;
  let errorHaptic: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    celebrate = jest.spyOn(haptics, "celebrate").mockImplementation(() => {});
    errorHaptic = jest.spyOn(haptics, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends a habit cheer with the habit and the day", async () => {
    const invoke = answer({ success: true, message: "Cheer sent" });
    const utils = await renderSendCheer(invoke);

    await act(async () => {
      await utils.result.current.value.mutateAsync({
        recipientId: "user-2",
        message: "Nice one!",
        goalId: "goal-1",
        day: "2026-10-16",
      });
    });

    expect(invoke).toHaveBeenCalledWith("send-cheer", {
      body: {
        recipient_id: "user-2",
        message: "Nice one!",
        goal_id: "goal-1",
        day: "2026-10-16",
      },
    });
  });

  it("sends a day cheer with no habit", async () => {
    const invoke = answer({ success: true, message: "Cheer sent" });
    const utils = await renderSendCheer(invoke);

    await act(async () => {
      await utils.result.current.value.mutateAsync({
        recipientId: "user-2",
        message: "",
        goalId: null,
        day: null,
      });
    });

    expect(invoke).toHaveBeenCalledWith("send-cheer", {
      body: { recipient_id: "user-2", message: "", goal_id: null, day: null },
    });
  });

  it("celebrates once the server confirms, and raises no alert", async () => {
    const utils = await renderSendCheer(
      answer({ success: true, message: "Cheer sent" }),
    );

    await act(async () => {
      await utils.result.current.value.mutateAsync({
        recipientId: "user-2",
        message: "",
        goalId: null,
        day: null,
      });
    });

    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(errorHaptic).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("shows the server's reason when it refuses the cheer", async () => {
    const utils = await renderSendCheer(
      answer({ success: false, message: "You've already cheered Ada for Run" }),
    );

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({
          recipientId: "user-2",
          message: "",
          goalId: "goal-1",
          day: "2026-10-16",
        }),
      ).rejects.toThrow("You've already cheered Ada for Run");
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Cheer not sent",
      "You've already cheered Ada for Run",
    );
    expect(errorHaptic).toHaveBeenCalledTimes(1);
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("falls back to a connection message when the function can't be reached", async () => {
    const utils = await renderSendCheer(
      answer(null, new Error("Failed to send a request to the Edge Function")),
    );

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({
          recipientId: "user-2",
          message: "",
          goalId: null,
          day: null,
        }),
      ).rejects.toThrow();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Cheer not sent",
      "Couldn't send that cheer. Check your connection and try again.",
    );
    expect(errorHaptic).toHaveBeenCalledTimes(1);
  });
});
