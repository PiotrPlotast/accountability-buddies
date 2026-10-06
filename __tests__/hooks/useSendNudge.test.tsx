import { act } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useSendNudge } from "@/hooks/useSendNudge";
import * as haptics from "@/lib/haptics";

import {
  buildFakeSupabase,
  buildWrapper,
  renderHookWithSession,
} from "../test-utils/render";

async function renderSendNudge(functionsImpl: jest.Mock) {
  const supabase = buildFakeSupabase({ functionsImpl });
  const { Wrapper } = buildWrapper({ supabase });
  return renderHookWithSession(() => useSendNudge(), Wrapper);
}

const answer = (data: unknown, error: unknown = null) =>
  jest.fn(() => Promise.resolve({ data, error }));

describe("useSendNudge", () => {
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

  it("calls the send-nudge function with the recipient and the message", async () => {
    const invoke = answer({ success: true, message: "Nudge sent" });
    const utils = await renderSendNudge(invoke);

    await act(async () => {
      await utils.result.current.value.mutateAsync({
        recipientId: "user-2",
        message: "What about your run?",
      });
    });

    expect(invoke).toHaveBeenCalledWith("send-nudge", {
      body: { recipient_id: "user-2", message: "What about your run?" },
    });
  });

  it("celebrates once the server confirms, and raises no alert", async () => {
    const utils = await renderSendNudge(
      answer({ success: true, message: "Nudge sent" }),
    );

    await act(async () => {
      await utils.result.current.value.mutateAsync({
        recipientId: "user-2",
        message: "",
      });
    });

    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(errorHaptic).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("shows the server's reason when it refuses the nudge", async () => {
    const utils = await renderSendNudge(
      answer({
        success: false,
        message: "You've already nudged Ada 3 times in the last 24 hours",
      }),
    );

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({
          recipientId: "user-2",
          message: "",
        }),
      ).rejects.toThrow(
        "You've already nudged Ada 3 times in the last 24 hours",
      );
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Nudge not sent",
      "You've already nudged Ada 3 times in the last 24 hours",
    );
    expect(errorHaptic).toHaveBeenCalledTimes(1);
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("falls back to a connection message when the function can't be reached", async () => {
    const utils = await renderSendNudge(
      answer(null, new Error("Failed to send a request to the Edge Function")),
    );

    await act(async () => {
      await expect(
        utils.result.current.value.mutateAsync({
          recipientId: "user-2",
          message: "",
        }),
      ).rejects.toThrow();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Nudge not sent",
      "Couldn't send that nudge. Check your connection and try again.",
    );
    expect(errorHaptic).toHaveBeenCalledTimes(1);
    expect(celebrate).not.toHaveBeenCalled();
  });
});
