import { forwardRef } from "react";
import { TextInput, TextInputProps, View } from "react-native";
import AppTextInput from "./AppTextInput";
import SectionLabel from "./SectionLabel";

type Props = TextInputProps & { label: string };

/**
 * A labelled text field on the auth screens: email, password, the sign-up
 * code. Forwards its ref so a screen can chain fields with `focus()`.
 */
const AuthField = forwardRef<TextInput, Props>(function AuthField(
  { label, ...input },
  ref,
) {
  return (
    <View className="gap-2">
      <SectionLabel>{label}</SectionLabel>
      <View className="border border-border rounded-tile px-4 h-14 justify-center bg-surface">
        <AppTextInput
          ref={ref}
          // The caption above is a separate Text; without this the field
          // is announced by its placeholder, or not at all for a password.
          accessibilityLabel={label}
          className="text-text text-base"
          {...input}
        />
      </View>
    </View>
  );
});

export default AuthField;
