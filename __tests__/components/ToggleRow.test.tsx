import { render, fireEvent } from "@testing-library/react-native";

import ToggleRow from "@/app/components/settings/ToggleRow";

describe("ToggleRow", () => {
  it("names the switch for screen readers", () => {
    // The label is the only thing announced — the description sits beside it
    // and would otherwise read as an unrelated blob of text.
    const { getByLabelText } = render(
      <ToggleRow
        label="Nudges"
        description="When a buddy pokes you."
        value
        onValueChange={jest.fn()}
      />,
    );

    expect(getByLabelText("Nudges")).toBeTruthy();
  });

  it("reports the flipped value, not the current one", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <ToggleRow label="Nudges" value onValueChange={onValueChange} />,
    );

    fireEvent(getByLabelText("Nudges"), "valueChange", false);

    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it("can be disabled while its value is still in flight", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <ToggleRow label="Nudges" value disabled onValueChange={onValueChange} />,
    );

    expect(getByLabelText("Nudges").props.disabled).toBe(true);
  });

  it("renders without a description", () => {
    const { getByLabelText, queryByText } = render(
      <ToggleRow label="Haptics" value={false} onValueChange={jest.fn()} />,
    );

    expect(getByLabelText("Haptics")).toBeTruthy();
    expect(queryByText("undefined")).toBeNull();
  });
});
