import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import AppTextInput from "@/app/components/ui/AppTextInput";
import DialogShell from "@/app/components/ui/DialogShell";
import NeedsConnection from "@/app/components/ui/NeedsConnection";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SectionLabel from "@/app/components/ui/SectionLabel";
import { useUpdateProfile } from "@/hooks/useUpdateProfile";
import { useTheme } from "@/hooks/useTheme";
import { MAX_NAME_LENGTH, isValidName, normalizeName } from "@/lib/displayName";
import { useIsOnline } from "@/lib/onlineStatus";

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
  // Your name is what your buddies see, so it waits for a connection rather
  // than queueing.
  const isOnline = useIsOnline();

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
  const canSave = isValidName(name) && dirty && isOnline && !saving;

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
    <DialogShell
      isVisible={isVisible}
      onRequestClose={onClose}
      onBackdropPress={dismissOnBackdrop}
      backdropLabel="Close"
      cardClassName="bg-bg border border-border rounded-tile overflow-hidden"
    >
      <View style={{ padding: 24 }}>
        <SectionLabel className="mb-3">Your name</SectionLabel>
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
        <PrimaryButton
          label="Save"
          onPress={handleSave}
          filled={canSave}
          busy={saving}
          className="flex-1"
        />
      </View>
      {!isOnline ? <NeedsConnection className="mb-4 -mt-2" /> : null}
    </DialogShell>
  );
}
