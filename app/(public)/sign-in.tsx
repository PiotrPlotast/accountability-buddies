import "../../global.css";
import { useState } from "react";
import { Text, View, ScrollView } from "react-native";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import { themeColors } from "@/lib/colors";
import { useTheme } from "@/hooks/useTheme";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSignIn } from "@/hooks/useSignIn";
import AppleAuth from "@/app/components/auth/AppleAuth";
import CredentialFields from "@/app/components/auth/CredentialFields";
import FormError from "@/app/components/auth/FormError";
import { getAuthErrorMessage } from "@/lib/authErrors";

export default function Page() {
  const { signInWithPassword, isLoaded } = useSignIn();
  const { accent } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSignInPress = async () => {
    if (!isLoaded || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      await signInWithPassword({ email: email.trim(), password });
      // On success the session guard swaps navigation groups and unmounts
      // this screen, so there is nothing to reset.
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setSubmitting(false);
    }
  };

  const isFilled = !!email && !!password;

  return (
    <SafeAreaView
      edges={["left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: themeColors.background }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          className="text-text font-mono-bold"
          style={{ fontSize: 32, lineHeight: 36 }}
          accessibilityRole="header"
        >
          Sign in
        </Text>

        <CredentialFields
          email={email}
          password={password}
          onEmailChange={(next) => {
            setEmail(next);
            setError(null);
          }}
          onPasswordChange={(next) => {
            setPassword(next);
            setError(null);
          }}
          onSubmit={onSignInPress}
        />

        <FormError message={error} />

        <PrimaryButton
          label="Continue"
          onPress={onSignInPress}
          filled={isFilled}
          busy={submitting}
          className="mt-2"
          smallLabel
        />

        <AppleAuth onError={setError} />

        <View className="flex-row justify-center mt-2">
          <Text className="text-text-muted font-mono text-sm">
            No account?{" "}
          </Text>
          <Text
            className="font-mono-medium text-sm"
            style={{ color: accent.hex }}
            onPress={() => router.replace("/sign-up")}
            accessibilityRole="link"
          >
            Sign up
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
