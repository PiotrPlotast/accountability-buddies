import "../../global.css";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  Pressable,
  View,
  ScrollView,
} from "react-native";
import AppTextInput from "@/app/components/ui/AppTextInput";

import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSignUp } from "@/hooks/useSignUp";
import { themeColors } from "@/lib/colors";
import { useTheme } from "@/hooks/useTheme";
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
  const passwordRef = useRef<TextInput>(null);

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
    const canVerify = !!token && !submitting;

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
          <View className="gap-2 mt-4">
            <Text className="text-text-muted font-mono uppercase text-xs tracking-widest">
              Verification code
            </Text>
            <View className="border border-border rounded-tile px-4 h-14 justify-center bg-surface">
              <AppTextInput
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
                className="text-text text-base"
              />
            </View>
          </View>

          <FormError message={error} />

          <Pressable
            onPress={onVerifyPress}
            disabled={!canVerify}
            className="h-14 rounded-tile items-center justify-center mt-2"
            style={{
              backgroundColor: token ? accent.hex : themeColors.surface,
            }}
          >
            {submitting ? (
              <ActivityIndicator color={themeColors.background} />
            ) : (
              <Text
                className={`font-mono-bold ${token ? "text-bg" : "text-text-dim"}`}
              >
                Verify
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Kept apart so the button stays filled (and the dark spinner stays visible)
  // while the request is in flight, rather than greying out mid-submit.
  const isFilled = !!email && !!password;
  const canSubmit = isFilled && !submitting;

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

        <View className="gap-2 mt-4">
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest">
            Email
          </Text>
          <View className="border border-border rounded-tile px-4 h-14 justify-center bg-surface">
            <AppTextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              textContentType="username"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              value={email}
              placeholder="you@example.com"
              onChangeText={(next) => {
                setEmail(next);
                setError(null);
              }}
              className="text-text text-base"
            />
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest">
            Password
          </Text>
          <View className="border border-border rounded-tile px-4 h-14 justify-center bg-surface">
            <AppTextInput
              ref={passwordRef}
              value={password}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={onSignUpPress}
              onChangeText={(next) => {
                setPassword(next);
                setError(null);
              }}
              className="text-text text-base"
            />
          </View>
        </View>

        <FormError message={error} />

        <Pressable
          onPress={onSignUpPress}
          disabled={!canSubmit}
          className="h-14 rounded-tile items-center justify-center mt-2"
          style={{
            backgroundColor: isFilled ? accent.hex : themeColors.surface,
          }}
        >
          {submitting ? (
            <ActivityIndicator color={themeColors.background} />
          ) : (
            <Text
              className={`font-mono-bold ${isFilled ? "text-bg" : "text-text-dim"}`}
            >
              Continue
            </Text>
          )}
        </Pressable>

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
