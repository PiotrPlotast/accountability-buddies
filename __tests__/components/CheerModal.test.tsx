import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import CheerModal from "@/app/components/dashboard/CheerModal";
import { DAY_CHEER_PRESETS, habitCheerPresets } from "@/lib/cheer";
import * as haptics from "@/lib/haptics";

import { buildFakeSupabase, buildWrapper } from "../test-utils/render";

function renderModal(
  opts: {
    invoke?: jest.Mock;
    goal?: { id: string; title: string } | null;
    day?: string | null;
  } = {},
) {
  const invoke =
    opts.invoke ??
    jest.fn(() =>
      Promise.resolve({
        data: { success: true, message: "Cheer sent" },
        error: null,
      }),
    );
  const onClose = jest.fn();
  const onSent = jest.fn();
  const { Wrapper } = buildWrapper({
    supabase: buildFakeSupabase({ functionsImpl: invoke }),
  });
  const utils = render(
    <CheerModal
      recipient={{ userId: "user-2", name: "Ada" }}
      goal={opts.goal ?? null}
      day={opts.day === undefined ? "2026-10-16" : opts.day}
      isVisible
      onClose={onClose}
      onSent={onSent}
    />,
    { wrapper: Wrapper },
  );
  return { ...utils, invoke, onClose, onSent };
}

const run = { id: "goal-1", title: "Run" };

describe("CheerModal", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(haptics, "celebrate").mockImplementation(() => {});
    jest.spyOn(haptics, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("names the buddy and the habit for a habit cheer, with its presets", () => {
    const { getByText, getByLabelText } = renderModal({ goal: run });
    expect(getByText("Cheer Ada for Run")).toBeTruthy();
    for (const preset of habitCheerPresets("Run")) {
      expect(getByText(preset)).toBeTruthy();
    }
    expect(getByLabelText("Cheer message").props.value).toBe("");
  });

  it("names the day for a day cheer, with presets of its own", () => {
    const { getByText, queryByText } = renderModal();
    expect(getByText("Cheer Ada's day")).toBeTruthy();
    for (const preset of DAY_CHEER_PRESETS) {
      expect(getByText(preset)).toBeTruthy();
    }
    expect(queryByText("Nice work on Run!")).toBeNull();
  });

  it("caps the message at 140 characters and counts as you type", () => {
    const { getByLabelText, getByText } = renderModal();
    const input = getByLabelText("Cheer message");
    expect(input.props.maxLength).toBe(140);
    fireEvent.changeText(input, "Hello");
    expect(getByText("5/140")).toBeTruthy();
  });

  it("fills the box from a preset", () => {
    const { getByText, getByLabelText } = renderModal({ goal: run });
    fireEvent.press(getByText("Nice work on Run!"));
    expect(getByLabelText("Cheer message").props.value).toBe(
      "Nice work on Run!",
    );
  });

  it("sends a habit cheer with the habit and the day, then reports and closes", async () => {
    const { getByText, getByLabelText, invoke, onSent, onClose } = renderModal({
      goal: run,
    });
    fireEvent.changeText(getByLabelText("Cheer message"), "Legend");

    await act(async () => {
      fireEvent.press(getByText("Send"));
    });

    expect(invoke).toHaveBeenCalledWith("send-cheer", {
      body: {
        recipient_id: "user-2",
        message: "Legend",
        goal_id: "goal-1",
        day: "2026-10-16",
      },
    });
    await waitFor(() => expect(onSent).toHaveBeenCalledWith("Ada"));
    expect(onClose).toHaveBeenCalled();
  });

  it("sends an empty day cheer, which the server gives its default line", async () => {
    const { getByText, invoke } = renderModal({ day: null });

    await act(async () => {
      fireEvent.press(getByText("Send"));
    });

    expect(invoke).toHaveBeenCalledWith("send-cheer", {
      body: { recipient_id: "user-2", message: "", goal_id: null, day: null },
    });
  });

  it("stays open with the text kept when the cheer is refused", async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({
        data: { success: false, message: "You've already cheered Ada's day" },
        error: null,
      }),
    );
    const { getByText, getByLabelText, onSent, onClose } = renderModal({
      invoke,
    });
    fireEvent.changeText(getByLabelText("Cheer message"), "Yes!");

    await act(async () => {
      fireEvent.press(getByText("Send"));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Cheer not sent",
        "You've already cheered Ada's day",
      ),
    );
    expect(onSent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(getByLabelText("Cheer message").props.value).toBe("Yes!");
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

    await act(async () => {
      finish({ data: { success: true, message: "Cheer sent" }, error: null });
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
  });
});
