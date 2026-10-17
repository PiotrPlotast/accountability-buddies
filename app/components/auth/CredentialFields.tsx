import { useRef } from "react";
import { TextInput, View } from "react-native";
import AuthField from "@/app/components/ui/AuthField";

type Props = {
  email: string;
  password: string;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  // The password field's Go key.
  onSubmit: () => void;
  // Sign-up: the password manager offers to make one rather than fill one in.
  newPassword?: boolean;
};

/** The email and password pair shared by sign-in and sign-up. */
export default function CredentialFields({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  newPassword = false,
}: Props) {
  const passwordRef = useRef<TextInput>(null);

  return (
    <View className="gap-4 mt-4">
      <AuthField
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        textContentType="username"
        keyboardType="email-address"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        value={email}
        placeholder="you@example.com"
        onChangeText={onEmailChange}
      />
      <AuthField
        ref={passwordRef}
        label="Password"
        value={password}
        placeholder="••••••••"
        secureTextEntry
        autoComplete={newPassword ? "new-password" : "current-password"}
        textContentType={newPassword ? "newPassword" : "password"}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        onChangeText={onPasswordChange}
      />
    </View>
  );
}
