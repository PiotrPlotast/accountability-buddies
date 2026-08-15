import { createRef } from "react";
import { TextInput } from "react-native";
import { render } from "@testing-library/react-native";

import AppTextInput from "@/app/components/ui/AppTextInput";
import { themeColors } from "@/lib/colors";

// The style prop arrives as an array; flatten it the way RN would.
const styleOf = (node: { props: { style?: unknown } }) =>
  Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));

describe("AppTextInput", () => {
  // NativeWind's `font-mono` never reached a TextInput's text, which is why
  // every call site used to carry this inline.
  it("applies the mono font every input needs", () => {
    const { getByPlaceholderText } = render(<AppTextInput placeholder="hi" />);
    expect(styleOf(getByPlaceholderText("hi"))).toMatchObject({
      fontFamily: "GeistMono_400Regular",
    });
  });

  it("supports the heavier weights", () => {
    const { getByPlaceholderText, rerender } = render(
      <AppTextInput placeholder="hi" weight="bold" />,
    );
    expect(styleOf(getByPlaceholderText("hi"))).toMatchObject({
      fontFamily: "GeistMono_700Bold",
    });

    rerender(<AppTextInput placeholder="hi" weight="medium" />);
    expect(styleOf(getByPlaceholderText("hi"))).toMatchObject({
      fontFamily: "GeistMono_500Medium",
    });
  });

  it("defaults the placeholder colour so call sites needn't repeat it", () => {
    const { getByPlaceholderText } = render(<AppTextInput placeholder="hi" />);
    expect(getByPlaceholderText("hi").props.placeholderTextColor).toBe(
      themeColors.textDim,
    );
  });

  it("lets a caller override the placeholder colour", () => {
    const { getByPlaceholderText } = render(
      <AppTextInput placeholder="hi" placeholderTextColor="#FF0000" />,
    );
    expect(getByPlaceholderText("hi").props.placeholderTextColor).toBe(
      "#FF0000",
    );
  });

  it("keeps a caller's own style, layered over the font", () => {
    const { getByPlaceholderText } = render(
      <AppTextInput placeholder="hi" style={{ letterSpacing: 4 }} />,
    );
    expect(styleOf(getByPlaceholderText("hi"))).toMatchObject({
      fontFamily: "GeistMono_400Regular",
      letterSpacing: 4,
    });
  });

  it("passes other props through untouched", () => {
    const { getByPlaceholderText } = render(
      <AppTextInput placeholder="hi" autoCapitalize="characters" />,
    );
    expect(getByPlaceholderText("hi").props.autoCapitalize).toBe("characters");
  });

  // sign-in and sign-up chain email -> password via `onSubmitEditing`, which
  // needs a real TextInput instance behind the ref.
  it("forwards its ref so field chaining still works", () => {
    const ref = createRef<TextInput>();
    render(<AppTextInput placeholder="hi" ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.focus).toBe("function");
  });
});
