import "../../global.css";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import AppTextInput from "@/app/components/ui/AppTextInput";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import { useUpdateProfile } from "@/hooks/useUpdateProfile";
import { useTheme } from "@/hooks/useTheme";
import { MAX_NAME_LENGTH, isValidName } from "@/lib/displayName";
import SectionLabel from "@/app/components/ui/SectionLabel";

/**
 * Asked once, of everyone — email and Apple sign-in alike — because a provider
 * hands over a name at most once and an app that never leans on that value
 * can't be hurt by a user who hid it, reinstalled, or lost the network on the
 * one pass.
 *
 * No skip and no prefilled suggestion: most people accept a prefill, which
 * rebuilds "Unknown" under a friendlier label, and skipping puts the cost of a
 * nameless member on the rest of their group. `(protected)/_layout.tsx` is
 * what keeps this screen unskippable — it's the only route mounted while the
 * name is missing, so there's nothing to navigate back to.
 */
export default function NameScreen() {
  const { accent } = useTheme();
  const router = useRouter();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState("");
  const saving = updateProfile.isPending;
  const canSave = isValidName(name) && !saving;

  const handleContinue = async () => {
    if (!canSave) return;
    try {
      await updateProfile.mutateAsync({ fullName: name });
      router.replace("/");
    } catch {
      // useUpdateProfile already alerted and rolled the cache back. Stay put
      // so the typed name isn't lost to a network blip.
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 justify-center">
            <SectionLabel className="mb-3">One last thing</SectionLabel>
            <Text className="text-text font-mono-bold text-2xl mb-2">
              What should we call you?
            </Text>
            <Text className="text-text-muted text-sm mb-8">
              Your buddies see this next to your habits.
            </Text>

            <View
              style={{ borderColor: accent.hex }}
              className="border-2 rounded-tile px-4 h-14 justify-center bg-bg"
            >
              <AppTextInput
                value={name}
                onChangeText={setName}
                autoFocus
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={MAX_NAME_LENGTH}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
                placeholder="Your name"
                accessibilityLabel="Your name"
                className="text-text text-base"
              />
            </View>
          </View>

          <PrimaryButton
            label="Continue"
            onPress={handleContinue}
            filled={canSave}
            busy={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
