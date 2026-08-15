import { render, fireEvent } from "@testing-library/react-native";

import DayPicker from "@/app/components/habits/DayPicker";
import IconPicker from "@/app/components/habits/IconPicker";

// NativeWind is disabled under Jest (see babel.config.js), so `className`
// arrives as a plain string prop. That makes it the only way to assert an
// unselected chip actually gets a background — a chip with none (or one
// painted the colour of what's behind it) is invisible on screen. Both
// pickers assume a `bg-bg` surface behind them.
describe("habit pickers", () => {
  it("gives unselected days a background and border", () => {
    const { getByLabelText } = render(
      <DayPicker value={[0]} onChange={() => {}} />,
    );
    const unselected = getByLabelText("Tue").props.className;
    expect(unselected).toContain("bg-surface");
    expect(unselected).toContain("border-border");
  });

  it("gives unselected icons a background and border", () => {
    const { getByLabelText } = render(
      <IconPicker value="🧘" onChange={() => {}} />,
    );
    const unselected = getByLabelText("📚").props.className;
    expect(unselected).toContain("bg-surface");
    expect(unselected).toContain("border-border");
  });

  it("gives the selected chip no background class, so the inline accent shows", () => {
    const { getByLabelText } = render(
      <DayPicker value={[0]} onChange={() => {}} />,
    );
    const selected = getByLabelText("Mon");
    expect(selected.props.className).not.toContain("bg-");
    expect(selected.props.style).toMatchObject({ backgroundColor: "#C6F94A" });
  });

  it("toggles days, keeping the selection sorted", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <DayPicker value={[4, 0]} onChange={onChange} />,
    );

    fireEvent.press(getByLabelText("Wed"));
    expect(onChange).toHaveBeenCalledWith([0, 2, 4]);

    fireEvent.press(getByLabelText("Mon"));
    expect(onChange).toHaveBeenLastCalledWith([4]);
  });

  // An empty selection is stored as "every day", so clearing the last chip
  // would mean the opposite of what the empty picker shows.
  it("refuses to clear the last selected day", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <DayPicker value={[2]} onChange={onChange} />,
    );

    fireEvent.press(getByLabelText("Wed"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still allows deselecting when more than one day is lit", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <DayPicker value={[2, 5]} onChange={onChange} />,
    );

    fireEvent.press(getByLabelText("Wed"));
    expect(onChange).toHaveBeenCalledWith([5]);
  });
});
