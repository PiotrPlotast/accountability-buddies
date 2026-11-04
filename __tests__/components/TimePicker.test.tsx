import { Platform } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import TimePicker from "@/app/components/habits/TimePicker";
import { formatReminderTime } from "@/lib/reminderTime";

const at = (h: number, m: number) => new Date(2026, 9, 8, h, m);

async function setup(value: string | null, extra: { allowOff?: boolean } = {}) {
  const onChange = jest.fn();
  const utils = await render(
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

  it("starts off with no time showing", async () => {
    const { getByLabelText, queryByTestId } = await setup(null);
    expect(getByLabelText("Reminder").props.value).toBe(false);
    expect(queryByTestId("date-time-picker")).toBeNull();
  });

  it("turning it on picks the default time", async () => {
    const { getByLabelText, onChange } = await setup(null);
    await fireEvent(getByLabelText("Reminder"), "valueChange", true);
    expect(onChange).toHaveBeenCalledWith("09:00");
  });

  it("turning it off clears the time", async () => {
    const { getByLabelText, onChange } = await setup("08:30");
    await fireEvent(getByLabelText("Reminder"), "valueChange", false);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("on iOS, shows the time inline and reports a new pick as HH:MM", async () => {
    const { getByTestId, onChange } = await setup("08:30");
    const picker = getByTestId("date-time-picker");
    expect(picker.props.mode).toBe("time");
    expect(picker.props.value.getHours()).toBe(8);
    expect(picker.props.value.getMinutes()).toBe(30);

    await fireEvent(picker, "change", { type: "set" }, at(7, 5));

    expect(onChange).toHaveBeenCalledWith("07:05");
  });

  it("on Android, opens the picker from the time and closes it after a pick", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const { getByText, getByTestId, queryByTestId, onChange } =
      await setup("08:30");
    expect(queryByTestId("date-time-picker")).toBeNull();

    await fireEvent.press(getByText(formatReminderTime("08:30")));
    await fireEvent(
      getByTestId("date-time-picker"),
      "change",
      { type: "set" },
      at(6, 45),
    );

    expect(onChange).toHaveBeenCalledWith("06:45");
    expect(queryByTestId("date-time-picker")).toBeNull();
  });

  it("on Android, a dismissed picker changes nothing", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const { getByText, getByTestId, queryByTestId, onChange } =
      await setup("08:30");

    await fireEvent.press(getByText(formatReminderTime("08:30")));
    await fireEvent(
      getByTestId("date-time-picker"),
      "change",
      { type: "dismissed" },
      undefined,
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(queryByTestId("date-time-picker")).toBeNull();
  });

  it("without allowOff, has no switch and always shows the time", async () => {
    const { queryByRole, getByTestId } = await setup("22:00", {
      allowOff: false,
    });
    expect(queryByRole("switch")).toBeNull();
    expect(getByTestId("date-time-picker").props.value.getHours()).toBe(22);
  });
});
