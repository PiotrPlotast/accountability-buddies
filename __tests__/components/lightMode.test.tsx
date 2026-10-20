import { Platform, Switch, Text } from "react-native";
import { render } from "@testing-library/react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Circle } from "react-native-svg";

import AppTextInput from "@/app/components/ui/AppTextInput";
import DialogShell from "@/app/components/ui/DialogShell";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import ToggleRow from "@/app/components/settings/ToggleRow";
import TimePicker from "@/app/components/habits/TimePicker";
import ProgressRing from "@/app/components/dashboard/ProgressRing";
import PublicLayout from "@/app/(public)/_layout";
import WelcomeScreen from "@/app/(public)/welcome";
import { accentsFor } from "@/lib/accents";
import { schemeColors } from "@/lib/colors";
import { formatReminderTime } from "@/lib/reminderTime";

import { setStubScheme } from "../test-utils/theme";

// Everything that paints a palette colour as a real value — a prop or an
// inline style rather than a class — used to read one static dark object.
// With the stub in light mode, none of them may still paint a dark value.
const light = schemeColors.light;
const lightAccent = accentsFor("light")[0];

const stackProps: Record<string, unknown>[] = [];
jest.mock("expo-router", () => {
  const React = require("react");
  const Stack = function Stack(props: Record<string, unknown>) {
    stackProps.push(props);
    return React.createElement(React.Fragment, null, props.children);
  };
  Stack.Screen = function StackScreen() {
    return null;
  };
  return { Stack };
});

const flat = (style: unknown) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

beforeEach(() => setStubScheme("light"));
afterEach(() => setStubScheme("dark"));

describe("in light mode", () => {
  it("dims a text field's placeholder with the light text-dim", () => {
    const { getByPlaceholderText } = render(<AppTextInput placeholder="hi" />);
    expect(getByPlaceholderText("hi").props.placeholderTextColor).toBe(
      light.textDim,
    );
  });

  it("draws a switch's off track and thumb from the light palette", () => {
    const { UNSAFE_getByType } = render(
      <ToggleRow label="Haptics" value={false} onValueChange={jest.fn()} />,
    );
    const toggle = UNSAFE_getByType(Switch);
    expect(toggle.props.trackColor).toEqual({
      false: light.surface2,
      true: lightAccent.dim,
    });
    expect(toggle.props.thumbColor).toBe(light.textDim);
  });

  it("asks iOS for the light time picker", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const { UNSAFE_getByType } = render(
      <TimePicker label="Reminder" value="08:30" onChange={jest.fn()} />,
    );
    expect(UNSAFE_getByType(DateTimePicker).props.themeVariant).toBe("light");
  });

  it("greys an unfilled button with the light surface", () => {
    const { getByRole } = render(
      <PrimaryButton label="Save" onPress={jest.fn()} filled={false} />,
    );
    expect(flat(getByRole("button").props.style).backgroundColor).toBe(
      light.surface,
    );
  });

  // The fill is the bright accent in both schemes, so whatever sits on it is
  // the dark on-accent colour, never the (white) page colour.
  it("spins a busy button's indicator in the on-accent colour", () => {
    const { getByTestId } = render(
      <PrimaryButton label="Save" onPress={jest.fn()} filled busy />,
    );
    expect(getByTestId("primary-button-spinner").props.color).toBe(
      light.onAccent,
    );
  });

  it("draws accent-coloured text in the darker text shade", () => {
    const { getByText } = render(<WelcomeScreen />);
    expect(flat(getByText("tiny crew.").props.style).color).toBe(
      lightAccent.text,
    );
    expect(lightAccent.text).not.toBe(lightAccent.hex);
  });

  it("writes Android's reminder time in the accent's text shade", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const { getByText } = render(
      <TimePicker label="Reminder" value="08:30" onChange={jest.fn()} />,
    );
    expect(flat(getByText(formatReminderTime("08:30")).props.style).color).toBe(
      lightAccent.text,
    );
  });

  it("dims behind a dialog with the light backdrop", () => {
    const { getByRole } = render(
      <DialogShell
        isVisible
        onRequestClose={jest.fn()}
        onBackdropPress={jest.fn()}
        backdropLabel="Cancel"
      >
        <Text>Card</Text>
      </DialogShell>,
    );
    expect(
      flat(getByRole("button", { name: "Cancel" }).props.style).backgroundColor,
    ).toBe(light.backdrop);
  });

  it("draws the progress ring's track in the light border", () => {
    const { UNSAFE_getAllByType } = render(<ProgressRing progress={0.5} />);
    expect(UNSAFE_getAllByType(Circle)[0].props.stroke).toBe(light.border);
  });

  it("paints the signed-out stack's chrome light", () => {
    stackProps.length = 0;
    render(<PublicLayout />);
    const options = stackProps[0].screenOptions as {
      headerStyle: { backgroundColor: string };
      headerTintColor: string;
      contentStyle: { backgroundColor: string };
    };
    expect(options.headerStyle.backgroundColor).toBe(light.background);
    expect(options.headerTintColor).toBe(light.text);
    expect(options.contentStyle.backgroundColor).toBe(light.background);
  });
});

// `accent.hex` is a fill. In light mode it is the bright neon, which is
// invisible as text on white, so text, icons, spinners and pull-to-refresh
// tints take `accent.text`. A fresh `color: accent.hex` would look fine in
// dark mode and vanish in light, so it is caught here instead.
describe("accent colour as text", () => {
  // No Node types in this project, so the two calls are typed by hand.
  const fs = require("fs") as {
    readdirSync(
      dir: string,
      opts: { withFileTypes: true },
    ): { name: string; isDirectory(): boolean }[];
    readFileSync(file: string, encoding: "utf8"): string;
  };
  const files: string[] = [];
  const walk = (dir: string) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) files.push(p);
    });
  walk("app");

  it("never paints text, icons or tints with the fill shade", () => {
    const offenders = files.flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ file, line, n: i + 1 }))
        .filter(({ line }) =>
          /(\bcolor(=\{|:\s)|tintColor=\{)[^\n]*accent\.hex/.test(line),
        )
        .map(({ file, n }) => `${file}:${n}`),
    );
    expect(offenders).toEqual([]);
  });
});
