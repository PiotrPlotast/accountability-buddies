import { createRef } from "react";
import { Text, type TextInputInstance } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import AuthField from "@/app/components/ui/AuthField";
import DialogShell from "@/app/components/ui/DialogShell";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import ScreenHeader from "@/app/components/ui/ScreenHeader";

beforeEach(() => jest.clearAllMocks());

describe("PrimaryButton", () => {
  it("presses when filled", async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <PrimaryButton label="Save" onPress={onPress} filled />,
    );

    const button = getByRole("button", { name: "Save" });
    await fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("is disabled until filled", async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <PrimaryButton label="Save" onPress={onPress} filled={false} />,
    );

    const button = getByRole("button", { name: "Save" });
    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  });

  // Busy keeps the fill (the spinner is dark and needs it) but takes no
  // second press, and keeps its name while the label text is swapped out.
  it("shows a spinner and refuses presses while busy", async () => {
    const onPress = jest.fn();
    const { getByRole, queryByText, getByTestId } = await render(
      <PrimaryButton label="Save" onPress={onPress} filled busy />,
    );

    const button = getByRole("button", { name: "Save" });
    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(queryByText("Save")).toBeNull();
    expect(getByTestId("primary-button-spinner")).toBeTruthy();
    expect(button.props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
  });

  it("can be disabled while filled", async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <PrimaryButton label="Save" onPress={onPress} filled disabled />,
    );

    await fireEvent.press(getByRole("button", { name: "Save" }));

    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("ScreenHeader", () => {
  it("shows the title and goes back", async () => {
    const { getByText, getByRole } = await render(
      <ScreenHeader title="New habit" />,
    );

    expect(getByText("New habit")).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "Back" }));

    expect(useRouter().back).toHaveBeenCalledTimes(1);
  });

  it("puts an action on the right when given one", async () => {
    const { getByText } = await render(
      <ScreenHeader title="Group settings" right={<Text>Save</Text>} />,
    );

    expect(getByText("Save")).toBeTruthy();
  });
});

describe("DialogShell", () => {
  it("closes from the backdrop when allowed", async () => {
    const onBackdropPress = jest.fn();
    const { getByRole } = await render(
      <DialogShell
        isVisible
        onRequestClose={jest.fn()}
        onBackdropPress={onBackdropPress}
        backdropLabel="Close"
      >
        <Text>Body</Text>
      </DialogShell>,
    );

    await fireEvent.press(getByRole("button", { name: "Close" }));

    expect(onBackdropPress).toHaveBeenCalledTimes(1);
  });

  it("offers no backdrop button when closing isn't allowed", async () => {
    const { queryByRole, getByText } = await render(
      <DialogShell isVisible onRequestClose={jest.fn()} backdropLabel="Close">
        <Text>Body</Text>
      </DialogShell>,
    );

    expect(getByText("Body")).toBeTruthy();
    expect(queryByRole("button", { name: "Close" })).toBeNull();
  });
});

describe("AuthField", () => {
  it("labels the input and forwards its props and ref", async () => {
    const onChangeText = jest.fn();
    const ref = createRef<TextInputInstance>();
    const { getByText, getByPlaceholderText } = await render(
      <AuthField
        ref={ref}
        label="Email"
        placeholder="you@example.com"
        value=""
        onChangeText={onChangeText}
      />,
    );

    expect(getByText("Email")).toBeTruthy();
    await fireEvent.changeText(
      getByPlaceholderText("you@example.com"),
      "a@b.c",
    );

    expect(onChangeText).toHaveBeenCalledWith("a@b.c");
    expect(ref.current).toBeTruthy();
  });
});
