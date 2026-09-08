import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import AppTextInput from "@/app/components/ui/AppTextInput";
import { useUpdateProfile } from "@/hooks/useUpdateProfile";
import { useTheme } from "@/hooks/useTheme";
import { MAX_NAME_LENGTH, isValidName, normalizeName } from "@/lib/displayName";
import { themeColors } from "@/lib/colors";

type Props = {
  currentName: string;
  isVisible: boolean;
  onClose: () => void;
};

/**
 * Renaming is the only recovery path if a name is ever wrong, so it ships with
 * the name screen rather than later. A modal in the edit/delete idiom, not
 * inline editing on a scrolling screen with the keyboard in the way.
 */
export default function RenameModal({
  currentName,
  isVisible,
  onClose,
}: Props) {
  const { accent } = useTheme();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState(currentName);
  const saving = updateProfile.isPending;

  // Re-seed each time it opens, so a cancelled edit doesn't come back on the
  // next open and a rename from elsewhere is reflected. Adjusted during render
  // off the closed -> open edge rather than in an effect: an effect here is
  // what the React Compiler hook rules flag in EditGoalModal (E6), and it
  // would also paint one frame of the stale name first.
  const [wasVisible, setWasVisible] = useState(isVisible);
  if (isVisible !== wasVisible) {
    setWasVisible(isVisible);
    if (isVisible) setName(currentName);
  }

  const dirty = normalizeName(name) !== normalizeName(currentName);
  const canSave = isValidName(name) && dirty && !saving;

  // Backdrop dismissal only when there's nothing to lose — matching
  // EditGoalModal, where a stray tap must not discard an edit.
  const dismissOnBackdrop = !dirty && !saving ? onClose : undefined;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await updateProfile.mutateAsync({ fullName: name });
      onClose();
    } catch {
      // Alerted and rolled back in useUpdateProfile; stay open so the edit
      // survives.
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable
          onPress={dismissOnBackdrop}
          accessibilityRole={dismissOnBackdrop ? "button" : undefined}
          accessibilityLabel={dismissOnBackdrop ? "Close" : undefined}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          {/* Absorbs taps landing on the dialog so they don't reach the
              backdrop, without announcing the card as a button. */}
          <View
            onStartShouldSetResponder={() => true}
            className="bg-bg border border-border rounded-tile overflow-hidden"
          >
            <View style={{ padding: 24 }}>
              <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
                Your name
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
                  onSubmitEditing={handleSave}
                  placeholder="Your name"
                  accessibilityLabel="Your name"
                  className="text-text text-base"
                />
              </View>
            </View>

            <View className="flex-row gap-3 px-6 pb-6">
              <Pressable
                onPress={onClose}
                disabled={saving}
                accessibilityRole="button"
                className="flex-1 h-14 rounded-tile items-center justify-center bg-surface border border-border"
              >
                <Text className="text-text-muted font-mono-medium text-base">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={!canSave}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSave }}
                className="flex-1 h-14 rounded-tile items-center justify-center"
                style={{
                  backgroundColor: canSave ? accent.hex : themeColors.surface,
                }}
              >
                {saving ? (
                  <ActivityIndicator color={themeColors.background} />
                ) : (
                  <Text
                    className={`font-mono-bold text-base ${
                      canSave ? "text-bg" : "text-text-dim"
                    }`}
                  >
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
