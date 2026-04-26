import "../../global.css";
import { useState } from "react";
import { Text, TextInput, Pressable, View, ScrollView } from "react-native";

import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSignIn } from "@/hooks/useSignIn";

export default function Page() {
  const { signInWithPassword, isLoaded } = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSignInPress = async () => {
    if (!isLoaded) return;

    try {
      await signInWithPassword({ email, password });
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  const canSubmit = !!email && !!password;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0B0C" }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
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
          onPress={onSignInPress}
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
