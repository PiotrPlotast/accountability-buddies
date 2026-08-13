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
import { themeColors } from "@/lib/colors";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSignIn } from "@/hooks/useSignIn";
import FormError from "@/app/components/auth/FormError";
import { getAuthErrorMessage } from "@/lib/authErrors";

export default function Page() {
  const { signInWithPassword, isLoaded } = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

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
          Sign in
        </Text>

        <View className="gap-2 mt-4">
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest">
            Email
          </Text>
          <View className="border border-border rounded-tile px-4 h-14 justify-center bg-surface">
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              textContentType="username"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              value={email}
              placeholder="you@example.com"
              placeholderTextColor="#6B7280"
              onChangeText={(next) => {
                setEmail(next);
                setError(null);
              }}
              className="text-text font-mono text-base"
              style={{ fontFamily: "GeistMono_400Regular" }}
            />
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest">
            Password
          </Text>
          <View className="border border-border rounded-tile px-4 h-14 justify-center bg-surface">
            <TextInput
              ref={passwordRef}
              value={password}
              placeholder="••••••••"
              placeholderTextColor="#6B7280"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={onSignInPress}
              onChangeText={(next) => {
                setPassword(next);
                setError(null);
              }}
              className="text-text font-mono text-base"
              style={{ fontFamily: "GeistMono_400Regular" }}
            />
          </View>
        </View>

        <FormError message={error} />

        <Pressable
          onPress={onSignInPress}
          disabled={!canSubmit}
          className={`h-14 rounded-tile items-center justify-center mt-2 ${isFilled ? "bg-neon" : "bg-surface"}`}
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
            No account?{" "}
          </Text>
          <Text
            className="text-neon font-mono-medium text-sm"
            onPress={() => router.replace("/sign-up")}
          >
            Sign up
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
