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
 * `TextInput` with the app's font applied.
 *
 * NativeWind's `font-mono` doesn't reach a TextInput's text, so every input in
 * the app carried its own `style={{ fontFamily: ... }}` plus the same
 * placeholder colour. Both live here now; callers keep `className` for size
 * and colour as before.
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
