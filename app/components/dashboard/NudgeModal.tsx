import { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import AppTextInput from "@/app/components/ui/AppTextInput";
import { useSendNudge } from "@/hooks/useSendNudge";
import { useTheme } from "@/hooks/useTheme";
import { MAX_NUDGE_LENGTH } from "@/lib/nudge";

export const NUDGE_PRESETS = [
  "How's it going today?",
  "Don't break the streak!",
  "You've got this 💪",
  "Let's finish the day together",
] as const;

type Props = {
  recipient: { userId: string; name: string } | null;
  // Read once, when the modal mounts. Dashboard remounts it (`key`) for each
  // nudge, so a new prefill never has to be copied into state by an effect.
  initialMessage?: string;
  isVisible: boolean;
  onClose: () => void;
  onSent: (name: string) => void;
};

/**
 * Compose a nudge. Opened from the dashboard body — the button or a swipe on a
 * buddy's habit — never from the habit manager, so it needs no place in
 * `Dashboard`'s `pendingAction` queue.
 *
 * An empty message is sendable: the server fills in its default line. On a
 * refusal the modal stays open with the text intact; `useSendNudge` has
 * already shown why.
 */
export default function NudgeModal({
  recipient,
  initialMessage = "",
  isVisible,
  onClose,
  onSent,
}: Props) {
  const { accent } = useTheme();
  const { mutateAsync, isPending } = useSendNudge();
  const [message, setMessage] = useState(initialMessage);
  // `isPending` lands a render late; two taps inside that render would both
  // see it false. The ref closes that gap.
  const inFlight = useRef(false);

  const handleSend = async () => {
    if (!recipient || inFlight.current) return;
    inFlight.current = true;
    try {
      await mutateAsync({ recipientId: recipient.userId, message });
      onSent(recipient.name);
      onClose();
    } catch {
      // useSendNudge raised the Alert; keep the box open for a retry.
    } finally {
      inFlight.current = false;
    }
  };

  const close = isPending ? undefined : onClose;

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          {/* Absorbs taps on the card so they don't reach the backdrop. */}
          <View
            onStartShouldSetResponder={() => true}
            className="bg-surface border border-border rounded-tile p-6"
          >
            <Text className="text-text font-mono-bold text-lg mb-4">
              Nudge {recipient?.name}
            </Text>

            <View
              style={{ borderColor: accent.hex }}
              className="border-2 rounded-tile px-4 py-3 bg-bg"
            >
              <AppTextInput
                value={message}
                onChangeText={setMessage}
                maxLength={MAX_NUDGE_LENGTH}
                multiline
                autoFocus
                placeholder="Say something, or send it as it is"
                accessibilityLabel="Nudge message"
                className="text-text text-base"
                style={{ minHeight: 60 }}
              />
            </View>
            <Text className="text-text-muted font-mono text-xs text-right mt-2">
              {`${message.length}/${MAX_NUDGE_LENGTH}`}
            </Text>

            <View className="flex-row flex-wrap gap-2 mt-3 mb-5">
              {NUDGE_PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => setMessage(preset)}
                  className="px-3 py-2 rounded-tile bg-bg border border-border"
                >
                  <Text className="text-text font-mono text-xs">{preset}</Text>
                </Pressable>
              ))}
            </View>

            <View className="flex-row gap-3">
              <Pressable
                onPress={onClose}
                disabled={isPending}
                className="flex-1 h-12 rounded-tile items-center justify-center bg-bg border border-border"
              >
                <Text className="text-text-muted font-mono-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSend}
                disabled={isPending}
                className="flex-1 h-12 rounded-tile items-center justify-center"
                style={{ backgroundColor: accent.hex }}
              >
                <Text className="text-bg font-mono-bold">
                  {isPending ? "Sending…" : "Send"}
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
