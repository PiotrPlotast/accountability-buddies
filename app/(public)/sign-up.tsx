import "../../global.css";
import { useState } from "react";
import { Text, View, ScrollView } from "react-native";
import AuthField from "@/app/components/ui/AuthField";
import PrimaryButton from "@/app/components/ui/PrimaryButton";

import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import * as AppleAuthentication from "expo-apple-authentication";

import { useSignUp } from "@/hooks/useSignUp";
import { themeColors } from "@/lib/colors";
import { useTheme } from "@/hooks/useTheme";
import AppleAuth from "@/app/components/auth/AppleAuth";
import CredentialFields from "@/app/components/auth/CredentialFields";
import FormError from "@/app/components/auth/FormError";
import { getAuthErrorMessage } from "@/lib/authErrors";

export default function Page() {
  const { isLoaded, signUp, verifyOtp } = useSignUp();
  const { accent } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSignUpPress = async () => {
    if (!isLoaded || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      await signUp({ email: email.trim(), password });
      setPendingVerification(true);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      await verifyOtp({ email: email.trim(), token: token.trim() });
      // On success the session guard swaps navigation groups and unmounts this
      // screen, so there is nothing to reset.
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setSubmitting(false);
    }
  };

  if (pendingVerification) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: themeColors.background }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            className="text-text font-mono-bold"
            style={{ fontSize: 32, lineHeight: 36 }}
          >
            Check your inbox
          </Text>
          <Text className="text-text-muted font-mono text-sm">
            Enter the code we just sent to {email}.
          </Text>
          <View className="mt-4">
            <AuthField
              label="Verification code"
              value={token}
              placeholder="123456"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              returnKeyType="go"
              onSubmitEditing={onVerifyPress}
              onChangeText={(next) => {
                setToken(next);
                setError(null);
              }}
            />
          </View>

          <FormError message={error} />

          <PrimaryButton
            label="Verify"
            onPress={onVerifyPress}
            filled={!!token}
            busy={submitting}
            className="mt-2"
            smallLabel
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const isFilled = !!email && !!password;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          className="text-text font-mono-bold"
          style={{ fontSize: 32, lineHeight: 36 }}
        >
          Create account
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
          onSubmit={onSignUpPress}
          newPassword
        />

        <FormError message={error} />

        <PrimaryButton
          label="Continue"
          onPress={onSignUpPress}
          filled={isFilled}
          busy={submitting}
          className="mt-2"
          smallLabel
        />

        <AppleAuth
          onError={setError}
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
        />

        <View className="flex-row justify-center mt-2">
          <Text className="text-text-muted font-mono text-sm">
            Already have an account?{" "}
          </Text>
          <Text
            className="font-mono-medium text-sm"
            style={{ color: accent.hex }}
            onPress={() => router.replace("/sign-in")}
          >
            Sign in
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
