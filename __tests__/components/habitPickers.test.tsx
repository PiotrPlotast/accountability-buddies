import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  render,
  act,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react-native";

import * as haptics from "@/lib/haptics";
import DayPicker from "@/app/components/habits/DayPicker";
import IconPicker from "@/app/components/habits/IconPicker";
import { GROUP_ICON_CHOICES, ICON_CHOICES } from "@/lib/habitIcons";

// AsyncStorage and the emoji sheet are mocked in jest.setup.js; the sheet is
// two buttons, "sheet: pick unicorn" (🦄) and "sheet: close".
const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

beforeEach(() => {
  getItem.mockClear();
  getItem.mockResolvedValue(null);
  setItem.mockClear();
  setItem.mockResolvedValue(undefined);
});

// The stored row loads after mount; settle it so it lands inside act().
async function renderPicker(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {});
  return result;
}

// The order the icon tiles are drawn in, "+" excluded.
function tileOrder() {
  return screen
    .getAllByRole("button")
    .map((b) => b.props.accessibilityLabel as string)
    .filter((l) => l !== "More emoji" && !l.startsWith("sheet:"));
}

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

  it("gives unselected icons a background and border", async () => {
    const { getByLabelText } = await renderPicker(
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

describe("habit picker haptics", () => {
  let tap: jest.SpyInstance;

  beforeEach(() => {
    tap = jest.spyOn(haptics, "tapLight").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("taps when a day is selected", () => {
    const { getByLabelText } = render(
      <DayPicker value={[0]} onChange={() => {}} />,
    );
    fireEvent.press(getByLabelText("Wed"));
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it("taps when a day is deselected", () => {
    const { getByLabelText } = render(
      <DayPicker value={[0, 2]} onChange={() => {}} />,
    );
    fireEvent.press(getByLabelText("Wed"));
    expect(tap).toHaveBeenCalledTimes(1);
  });

  // Clearing the last day is refused (it would silently mean "every day"), and
  // a press that changes nothing must not feel like a press that does.
  it("stays silent on the refused last-day tap", () => {
    const { getByLabelText } = render(
      <DayPicker value={[0]} onChange={() => {}} />,
    );
    fireEvent.press(getByLabelText("Mon"));
    expect(tap).not.toHaveBeenCalled();
  });

  it("taps when an icon is picked", async () => {
    const { getByLabelText } = await renderPicker(
      <IconPicker value="🧘" onChange={() => {}} />,
    );
    fireEvent.press(getByLabelText("📚"));
    expect(tap).toHaveBeenCalledTimes(1);
  });
});

describe("icon picker: any emoji", () => {
  it("shows the eight default habit icons and a more-emoji tile", async () => {
    await renderPicker(<IconPicker value="🧘" onChange={() => {}} />);
    expect(tileOrder()).toEqual(ICON_CHOICES);
    expect(screen.getByLabelText("More emoji")).toBeTruthy();
  });

  it("selects an emoji from the full picker", async () => {
    const onChange = jest.fn();
    await renderPicker(<IconPicker value="🧘" onChange={onChange} />);

    fireEvent.press(screen.getByLabelText("More emoji"));
    fireEvent.press(screen.getByLabelText("sheet: pick unicorn"));

    expect(onChange).toHaveBeenCalledWith("🦄");
    expect(screen.queryByLabelText("sheet: close")).toBeNull();
  });

  it("puts a picked emoji at the front of the row, dropping the oldest", async () => {
    const { rerender } = await renderPicker(
      <IconPicker value="🧘" onChange={() => {}} />,
    );

    fireEvent.press(screen.getByLabelText("More emoji"));
    fireEvent.press(screen.getByLabelText("sheet: pick unicorn"));
    rerender(<IconPicker value="🦄" onChange={() => {}} />);

    const expected = ["🦄", ...ICON_CHOICES.slice(0, -1)];
    expect(tileOrder()).toEqual(expected);
    expect(screen.getByLabelText("🦄").props.accessibilityState).toEqual({
      selected: true,
    });
    await waitFor(() =>
      expect(JSON.parse(setItem.mock.calls.at(-1)[1])).toEqual(expected),
    );
  });

  it("changes nothing when the picker is closed without a choice", async () => {
    const onChange = jest.fn();
    await renderPicker(<IconPicker value="🧘" onChange={onChange} />);

    fireEvent.press(screen.getByLabelText("More emoji"));
    fireEvent.press(screen.getByLabelText("sheet: close"));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("sheet: close")).toBeNull();
    expect(tileOrder()).toEqual(ICON_CHOICES);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("shows the recents this phone stored", async () => {
    const stored = ["🦄", "🐙", "🧘"];
    getItem.mockResolvedValue(JSON.stringify(stored));
    await renderPicker(<IconPicker value="🧘" onChange={() => {}} />);

    await waitFor(() => expect(tileOrder()).toEqual(stored));
  });

  // Edited on another phone, or dropped off this one's recents: the habit's
  // current icon still has to be visible and selected.
  it("shows a selected icon that isn't in the row at the front", async () => {
    await renderPicker(<IconPicker value="🐙" onChange={() => {}} />);

    expect(tileOrder()).toEqual(["🐙", ...ICON_CHOICES]);
    expect(screen.getByLabelText("🐙").props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it("selects a quick pick without reordering the row or saving", async () => {
    const onChange = jest.fn();
    await renderPicker(<IconPicker value="🧘" onChange={onChange} />);

    fireEvent.press(screen.getByLabelText("💤"));

    expect(onChange).toHaveBeenCalledWith("💤");
    expect(tileOrder()).toEqual(ICON_CHOICES);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("uses the group set, under its own key, for group icons", async () => {
    await renderPicker(
      <IconPicker kind="group" value="👥" onChange={() => {}} />,
    );
    expect(tileOrder()).toEqual(GROUP_ICON_CHOICES);

    fireEvent.press(screen.getByLabelText("More emoji"));
    fireEvent.press(screen.getByLabelText("sheet: pick unicorn"));

    await waitFor(() => expect(setItem).toHaveBeenCalled());
    await renderPicker(<IconPicker value="🧘" onChange={() => {}} />);
    const keys = getItem.mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(2);
    expect(setItem.mock.calls[0][0]).toBe(keys[0]);
  });
});
