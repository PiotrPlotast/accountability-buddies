import { render } from "@testing-library/react-native";

import PublicLayout from "@/app/(public)/_layout";

// The screens of the signed-out stack draw their own heading ("Create account",
// "Welcome back"), so the native header must never draw a title of its own: on
// iOS a transparent large-title header painted a faint "Sign Up" under the
// heading and set its back button on top of it.
const stackProps: Record<string, unknown>[] = [];
const screenProps: { name: string; options?: Record<string, unknown> }[] = [];

jest.mock("expo-router", () => {
  const React = require("react");
  const Stack = function Stack(props: Record<string, unknown>) {
    stackProps.push(props);
    return React.createElement(React.Fragment, null, props.children);
  };
  Stack.Screen = function StackScreen(props: {
    name: string;
    options?: Record<string, unknown>;
  }) {
    screenProps.push(props);
    return null;
  };
  return { Stack };
});

function optionsFor(name: string) {
  const screen = screenProps.find((s) => s.name === name);
  return { ...(stackProps[0]?.screenOptions as object), ...screen?.options };
}

beforeEach(() => {
  stackProps.length = 0;
  screenProps.length = 0;
  render(<PublicLayout />);
});

describe("the signed-out stack", () => {
  it.each(["sign-up", "sign-in"])(
    "gives %s a back button but no title of its own",
    (name) => {
      const options = optionsFor(name);
      expect(options.headerShown).not.toBe(false);
      expect(options.headerTitle).toBe("");
      expect(options.headerLargeTitle).toBeFalsy();
    },
  );

  it.each(["sign-up", "sign-in"])(
    "keeps %s's content below the header instead of under it",
    (name) => {
      expect(optionsFor(name).headerTransparent).toBeFalsy();
    },
  );

  it("shows no header on the welcome screen, which has nothing to go back to", () => {
    expect(optionsFor("welcome").headerShown).toBe(false);
  });
});
