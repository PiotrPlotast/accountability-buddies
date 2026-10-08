import { Platform } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import TimePicker from "@/app/components/habits/TimePicker";
import { formatReminderTime } from "@/lib/reminderTime";

const at = (h: number, m: number) => new Date(2026, 9, 8, h, m);

function setup(value: string | null, extra: { allowOff?: boolean } = {}) {
  const onChange = jest.fn();
  const utils = render(
    <TimePicker
      label="Reminder"
      value={value}
      onChange={onChange}
      defaultTime="09:00"
      {...extra}
    />,
  );
  return { ...utils, onChange };
}

describe("TimePicker", () => {
  beforeEach(() => jest.replaceProperty(Platform, "OS", "ios"));

  it("starts off with no time showing", () => {
    const { getByLabelText, UNSAFE_queryByType } = setup(null);
    expect(getByLabelText("Reminder").props.value).toBe(false);
    expect(UNSAFE_queryByType(DateTimePicker)).toBeNull();
  });

  it("turning it on picks the default time", () => {
    const { getByLabelText, onChange } = setup(null);
    fireEvent(getByLabelText("Reminder"), "valueChange", true);
    expect(onChange).toHaveBeenCalledWith("09:00");
  });

  it("turning it off clears the time", () => {
    const { getByLabelText, onChange } = setup("08:30");
    fireEvent(getByLabelText("Reminder"), "valueChange", false);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("on iOS, shows the time inline and reports a new pick as HH:MM", () => {
    const { UNSAFE_getByType, onChange } = setup("08:30");
    const picker = UNSAFE_getByType(DateTimePicker);
    expect(picker.props.mode).toBe("time");
    expect(picker.props.value.getHours()).toBe(8);
    expect(picker.props.value.getMinutes()).toBe(30);

    act(() => picker.props.onChange({ type: "set" }, at(7, 5)));

    expect(onChange).toHaveBeenCalledWith("07:05");
  });

  it("on Android, opens the picker from the time and closes it after a pick", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const { getByText, UNSAFE_queryByType, onChange } = setup("08:30");
    expect(UNSAFE_queryByType(DateTimePicker)).toBeNull();

    fireEvent.press(getByText(formatReminderTime("08:30")));
    const picker = UNSAFE_queryByType(DateTimePicker)!;
    act(() => picker.props.onChange({ type: "set" }, at(6, 45)));

    expect(onChange).toHaveBeenCalledWith("06:45");
    expect(UNSAFE_queryByType(DateTimePicker)).toBeNull();
  });

  it("on Android, a dismissed picker changes nothing", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const { getByText, UNSAFE_queryByType, onChange } = setup("08:30");

    fireEvent.press(getByText(formatReminderTime("08:30")));
    act(() =>
      UNSAFE_queryByType(DateTimePicker)!.props.onChange(
        { type: "dismissed" },
        undefined,
      ),
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(UNSAFE_queryByType(DateTimePicker)).toBeNull();
  });

  it("without allowOff, has no switch and always shows the time", () => {
    const { queryByRole, UNSAFE_getByType } = setup("22:00", {
      allowOff: false,
    });
    expect(queryByRole("switch")).toBeNull();
    expect(UNSAFE_getByType(DateTimePicker).props.value.getHours()).toBe(22);
  });
});
