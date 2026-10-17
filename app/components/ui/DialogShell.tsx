import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
} from "react-native";

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
  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent
      onRequestClose={onRequestClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable
          onPress={onBackdropPress}
          accessibilityRole={onBackdropPress ? "button" : undefined}
          accessibilityLabel={onBackdropPress ? backdropLabel : undefined}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          {/* Absorbs taps landing on the card so they don't reach the
              backdrop. A plain responder rather than a Pressable, so the card
              doesn't announce itself as a button. */}
          <View
            onStartShouldSetResponder={() => true}
            className={cardClassName}
          >
            {children}
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
