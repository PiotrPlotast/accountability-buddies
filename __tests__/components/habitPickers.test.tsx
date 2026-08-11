import { render, fireEvent } from "@testing-library/react-native";

import DayPicker from "@/app/components/habits/DayPicker";
import IconPicker from "@/app/components/habits/IconPicker";

// NativeWind is disabled under Jest (see babel.config.js), so `className`
// arrives as a plain string prop. That makes it the only way to assert an
// unselected chip actually gets a background — and an unselected chip painted
// the same colour as what's behind it is invisible on screen.
describe("habit pickers", () => {
  it("paints unselected days against a page background by default", () => {
    const { getByLabelText } = render(
      <DayPicker value={[0]} onChange={() => {}} />,
    );
    expect(getByLabelText("Tue").props.className).toContain("bg-surface");
  });

  it("inverts unselected days inside a surface card so they stay visible", () => {
    const { getByLabelText } = render(
      <DayPicker value={[0]} onChange={() => {}} variant="card" />,
    );
    // The card itself is bg-surface; a bg-surface chip on it would vanish.
    const unselected = getByLabelText("Tue").props.className;
    expect(unselected).toContain("bg-bg");
    expect(unselected).not.toContain("bg-surface");
  });

  it("inverts unselected icons inside a surface card too", () => {
    const { getByLabelText } = render(
      <IconPicker value="🧘" onChange={() => {}} variant="card" />,
    );
    const unselected = getByLabelText("📚").props.className;
    expect(unselected).toContain("bg-bg");
    expect(unselected).not.toContain("bg-surface");
  });

  it("gives the selected chip no background class, so the inline accent shows", () => {
    const { getByLabelText } = render(
      <DayPicker value={[0]} onChange={() => {}} variant="card" />,
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
});
