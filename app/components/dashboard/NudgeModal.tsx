import ComposeModal from "./ComposeModal";
import { useSendNudge } from "@/hooks/useSendNudge";
import { MAX_NUDGE_LENGTH } from "@/lib/nudge";

export const NUDGE_PRESETS = [
  "How's it going today?",
  "Don't break the streak!",
  "You've got this 💪",
  "Let's finish the day together",
] as const;

type Props = {
  recipient: { userId: string; name: string } | null;
  // Read once, when the modal mounts (see `ComposeModal`).
  initialMessage?: string;
  isVisible: boolean;
  onClose: () => void;
  onSent: (name: string) => void;
};

/**
 * Compose a nudge. Opened from the dashboard body — the button or a swipe on a
 * buddy's habit — never from the habit manager, so it needs no place in
 * `Dashboard`'s `pendingAction` queue.
 */
export default function NudgeModal({
  recipient,
  initialMessage,
  isVisible,
  onClose,
  onSent,
}: Props) {
  const { mutateAsync, isPending } = useSendNudge();

  const send = async (message: string) => {
    if (!recipient) throw new Error("No recipient");
    await mutateAsync({ recipientId: recipient.userId, message });
    onSent(recipient.name);
  };

  return (
    <ComposeModal
      title={`Nudge ${recipient?.name ?? ""}`}
      initialMessage={initialMessage}
      presets={NUDGE_PRESETS}
      maxLength={MAX_NUDGE_LENGTH}
      inputLabel="Nudge message"
      isVisible={isVisible}
      isPending={isPending}
      onClose={onClose}
      onSend={send}
    />
  );
}
