import "../../global.css";
import { useState } from "react";
import { Text, TextInput, Pressable, View, ScrollView } from "react-native";

import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSignUp } from "@/hooks/useSignUp";

export default function Page() {
  const { isLoaded, signUp, verifyOtp } = useSignUp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [token, setToken] = useState("");

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    try {
      await signUp({ email, password });
      setPendingVerification(true);
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded) return;
    try {
      await verifyOtp({ email, token });
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  if (pendingVerification) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0B0C" }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
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
              <TextInput
                value={token}
                placeholder="123456"
                placeholderTextColor="#6B7280"
                keyboardType="number-pad"
                onChangeText={setToken}
                className="text-text font-mono text-base"
                style={{ fontFamily: "GeistMono_400Regular" }}
              />
            </View>
          </View>
          <Pressable
            onPress={onVerifyPress}
            disabled={!token}
            className={`h-14 rounded-tile items-center justify-center mt-2 ${token ? "bg-neon" : "bg-surface"}`}
          >
            <Text
              className={`font-mono-bold ${token ? "text-bg" : "text-text-dim"}`}
            >
              Verify
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const canSubmit = !!email && !!password;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0B0C" }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
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
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              placeholder="you@example.com"
              placeholderTextColor="#6B7280"
              onChangeText={setEmail}
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
              value={password}
              placeholder="••••••••"
              placeholderTextColor="#6B7280"
              secureTextEntry
              onChangeText={setPassword}
              className="text-text font-mono text-base"
              style={{ fontFamily: "GeistMono_400Regular" }}
            />
          </View>
        </View>

        <Pressable
          onPress={onSignUpPress}
          disabled={!canSubmit}
          className={`h-14 rounded-tile items-center justify-center mt-2 ${canSubmit ? "bg-neon" : "bg-surface"}`}
        >
          <Text
            className={`font-mono-bold ${canSubmit ? "text-bg" : "text-text-dim"}`}
          >
            Continue
          </Text>
        </Pressable>

        <View className="flex-row justify-center mt-2">
          <Text className="text-text-muted font-mono text-sm">
            Already have an account?{" "}
          </Text>
          <Text
            className="text-neon font-mono-medium text-sm"
            onPress={() => router.replace("/sign-in")}
          >
            Sign in
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
