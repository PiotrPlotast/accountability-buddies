import { forwardRef } from "react";
import { TextInput, TextInputProps } from "react-native";
import { themeColors } from "@/lib/colors";

const FONTS = {
  regular: "GeistMono_400Regular",
  medium: "GeistMono_500Medium",
  bold: "GeistMono_700Bold",
} as const;

type Props = TextInputProps & {
  weight?: keyof typeof FONTS;
};

/**
 * `TextInput` with the app's font and placeholder colour applied.
 *
 * `placeholderTextColor` is a prop rather than a style, so no class can ever
 * set it — that repetition is the reason this component exists, along with
 * `weight` for the bold invite-code field.
 *
 * The `fontFamily` default is inherited from the original styling work, which
 * set it inline on every input on the assumption that `font-mono` doesn't
 * reach a TextInput's text. That may no longer hold on NativeWind 4, and the
 * test suite can't say either way — babel.config.js drops the NativeWind
 * preset under NODE_ENV=test, so `className` never becomes a style there. It
 * stays as a default regardless: the alternative is `font-mono` repeated at
 * every call site, which is what this component removed.
 *
 * Callers keep `className` for size and colour as before.
 *
 * Forwards its ref, so screens chaining fields with `onSubmitEditing` still
 * hold a real `TextInput` and can call `.focus()` on it.
 */
const AppTextInput = forwardRef<TextInput, Props>(function AppTextInput(
  { weight = "regular", style, placeholderTextColor, ...rest },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      {...rest}
      placeholderTextColor={placeholderTextColor ?? themeColors.textDim}
      style={[{ fontFamily: FONTS[weight] }, style]}
    />
  );
});

export default AppTextInput;
