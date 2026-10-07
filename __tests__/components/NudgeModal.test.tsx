import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import NudgeModal, {
  NUDGE_PRESETS,
} from "@/app/components/dashboard/NudgeModal";
import * as haptics from "@/lib/haptics";

import { buildFakeSupabase, buildWrapper } from "../test-utils/render";

function renderModal(
  opts: {
    invoke?: jest.Mock;
    initialMessage?: string;
  } = {},
) {
  const invoke =
    opts.invoke ??
    jest.fn(() =>
      Promise.resolve({
        data: { success: true, message: "Nudge sent" },
        error: null,
      }),
    );
  const onClose = jest.fn();
  const onSent = jest.fn();
  const { Wrapper } = buildWrapper({
    supabase: buildFakeSupabase({ functionsImpl: invoke }),
  });
  const utils = render(
    <NudgeModal
      recipient={{ userId: "user-2", name: "Ada" }}
      initialMessage={opts.initialMessage}
      isVisible
      onClose={onClose}
      onSent={onSent}
    />,
    { wrapper: Wrapper },
  );
  return { ...utils, invoke, onClose, onSent };
}

describe("NudgeModal", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(haptics, "celebrate").mockImplementation(() => {});
    jest.spyOn(haptics, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("names the buddy and starts from the prefilled message", () => {
    const { getByText, getByLabelText } = renderModal({
      initialMessage: "Ada, what about your run?",
    });
    expect(getByText("Nudge Ada")).toBeTruthy();
    expect(getByLabelText("Nudge message").props.value).toBe(
      "Ada, what about your run?",
    );
    expect(getByText("25/140")).toBeTruthy();
  });

  it("caps the message at 140 characters and counts as you type", () => {
    const { getByLabelText, getByText } = renderModal();
    const input = getByLabelText("Nudge message");
    expect(input.props.maxLength).toBe(140);
    expect(getByText("0/140")).toBeTruthy();

    fireEvent.changeText(input, "Hello");
    expect(getByText("5/140")).toBeTruthy();
  });

  it("offers the four presets, and tapping one fills the message", () => {
    const { getByText, getByLabelText } = renderModal();
    expect(NUDGE_PRESETS).toEqual([
      "How's it going today?",
      "Don't break the streak!",
      "You've got this 💪",
      "Let's finish the day together",
    ]);

    fireEvent.press(getByText("Don't break the streak!"));
    expect(getByLabelText("Nudge message").props.value).toBe(
      "Don't break the streak!",
    );
  });

  it("sends what is in the box, then reports the buddy and closes", async () => {
    const { getByText, getByLabelText, invoke, onSent, onClose } =
      renderModal();
    fireEvent.changeText(getByLabelText("Nudge message"), "Run time!");

    await act(async () => {
      fireEvent.press(getByText("Send"));
    });

    expect(invoke).toHaveBeenCalledWith("send-nudge", {
      body: { recipient_id: "user-2", message: "Run time!" },
    });
    await waitFor(() => expect(onSent).toHaveBeenCalledWith("Ada"));
    expect(onClose).toHaveBeenCalled();
  });

  it("sends an empty message, which the server turns into its default line", async () => {
    const { getByText, invoke, onSent } = renderModal();

    await act(async () => {
      fireEvent.press(getByText("Send"));
    });

    expect(invoke).toHaveBeenCalledWith("send-nudge", {
      body: { recipient_id: "user-2", message: "" },
    });
    await waitFor(() => expect(onSent).toHaveBeenCalled());
  });

  it("stays open with the text kept when the nudge is refused", async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({
        data: { success: false, message: "Couldn't deliver that nudge" },
        error: null,
      }),
    );
    const { getByText, getByLabelText, onSent, onClose } = renderModal({
      invoke,
    });
    fireEvent.changeText(getByLabelText("Nudge message"), "Run time!");

    await act(async () => {
      fireEvent.press(getByText("Send"));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Nudge not sent",
        "Couldn't deliver that nudge",
      ),
    );
    expect(onSent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(getByLabelText("Nudge message").props.value).toBe("Run time!");
  });

  it("sends once however many times Send is tapped while it is in flight", async () => {
    let finish: (v: unknown) => void = () => {};
    const invoke = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { getByText, onSent } = renderModal({ invoke });

    fireEvent.press(getByText("Send"));
    await waitFor(() => expect(getByText("Sending…")).toBeTruthy());
    fireEvent.press(getByText("Sending…"));
    fireEvent.press(getByText("Sending…"));

    await act(async () => {
      finish({ data: { success: true, message: "Nudge sent" }, error: null });
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
  });
});
