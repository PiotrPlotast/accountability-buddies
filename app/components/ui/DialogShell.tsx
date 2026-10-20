import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { useTheme } from "@/hooks/useTheme";

type Props = {
  isVisible: boolean;
  // Android back. Pass `undefined` while a request is in flight.
  onRequestClose: (() => void) | undefined;
  // A tap on the dimmed backdrop. Leave it out when closing would lose
  // something (unsaved edits, a request in flight): the backdrop then does
  // nothing and isn't announced as a button.
  onBackdropPress?: () => void;
  // What the backdrop says to a screen reader: "Close", or "Cancel" where
  // dismissing is the safe half of a choice.
  backdropLabel: string;
  // The card's own surface and padding.
  cardClassName?: string;
  children: React.ReactNode;
};

/** A centred card over a dimmed backdrop, lifted clear of the keyboard. */
export default function DialogShell({
  isVisible,
  onRequestClose,
  onBackdropPress,
  backdropLabel,
  cardClassName = "bg-surface border border-border rounded-tile p-6",
  children,
}: Props) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent
      onRequestClose={onRequestClose}
    >
      <KeyboardAvoidingView
        testID="dialog-shell"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "center", padding: 20 }}
        // VoiceOver's two-finger scrub: the screen reader's tap outside.
        onAccessibilityEscape={onBackdropPress ?? onRequestClose}
      >
        {/* The backdrop sits behind the card, never around it. A Pressable
            is an accessibility element by default, and on iOS one of those
            hides everything inside it: wrapped in the backdrop, the whole
            card was a single "Cancel" to VoiceOver, field and buttons
            unreachable. */}
        <Pressable
          onPress={onBackdropPress}
          accessible={!!onBackdropPress}
          accessibilityRole={onBackdropPress ? "button" : undefined}
          accessibilityLabel={onBackdropPress ? backdropLabel : undefined}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.backdrop },
          ]}
        />
        <View className={cardClassName}>{children}</View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
