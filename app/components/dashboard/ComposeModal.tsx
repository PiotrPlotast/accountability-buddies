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
import { useTheme } from "@/hooks/useTheme";

type Props = {
  title: string;
  // Read once, when the modal mounts. Dashboard remounts it (`key`) for each
  // message, so a new prefill never has to be copied into state by an effect.
  initialMessage?: string;
  presets: readonly string[];
  maxLength: number;
  inputLabel: string;
  isVisible: boolean;
  isPending: boolean;
  onClose: () => void;
  // Rejects when the server refused; the caller has already said why.
  onSend: (message: string) => Promise<void>;
};

/**
 * The box a nudge and a cheer are both written in: a capped message with a
 * counter, a row of presets, Cancel and Send. An empty message is sendable —
 * the server fills in its default line. On a refusal the modal stays open
 * with the text intact.
 */
export default function ComposeModal({
  title,
  initialMessage = "",
  presets,
  maxLength,
  inputLabel,
  isVisible,
  isPending,
  onClose,
  onSend,
}: Props) {
  const { accent } = useTheme();
  const [message, setMessage] = useState(initialMessage);
  // `isPending` lands a render late; two taps inside that render would both
  // see it false. The ref closes that gap.
  const inFlight = useRef(false);

  const handleSend = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await onSend(message);
      onClose();
    } catch {
      // The caller raised the Alert; keep the box open for a retry.
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
              {title}
            </Text>

            <View
              style={{ borderColor: accent.hex }}
              className="border-2 rounded-tile px-4 py-3 bg-bg"
            >
              <AppTextInput
                value={message}
                onChangeText={setMessage}
                maxLength={maxLength}
                multiline
                autoFocus
                placeholder="Say something, or send it as it is"
                accessibilityLabel={inputLabel}
                className="text-text text-base"
                style={{ minHeight: 60 }}
              />
            </View>
            <Text className="text-text-muted font-mono text-xs text-right mt-2">
              {`${message.length}/${maxLength}`}
            </Text>

            <View className="flex-row flex-wrap gap-2 mt-3 mb-5">
              {presets.map((preset) => (
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
