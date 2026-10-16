import ComposeModal from "./ComposeModal";
import { useSendCheer } from "@/hooks/useSendCheer";
import {
  DAY_CHEER_PRESETS,
  MAX_CHEER_LENGTH,
  habitCheerPresets,
} from "@/lib/cheer";

type Props = {
  recipient: { userId: string; name: string };
  // Set for a habit cheer, null for a day cheer.
  goal: { id: string; title: string } | null;
  // The day the cheer is about; null leaves it to the server.
  day: string | null;
  isVisible: boolean;
  onClose: () => void;
  onSent: (name: string) => void;
};

/**
 * Compose a cheer. A habit cheer and a day cheer read differently — their
 * own title and presets — because they say different things: "nice run"
 * versus "what a day". Opened from the dashboard body only (the Cheer button,
 * a swipe on a ticked habit, or a tapped push), like `NudgeModal`.
 */
export default function CheerModal({
  recipient,
  goal,
  day,
  isVisible,
  onClose,
  onSent,
}: Props) {
  const { mutateAsync, isPending } = useSendCheer();

  const send = async (message: string) => {
    await mutateAsync({
      recipientId: recipient.userId,
      message,
      goalId: goal?.id ?? null,
      day,
    });
    onSent(recipient.name);
  };

  return (
    <ComposeModal
      title={
        goal
          ? `Cheer ${recipient.name} for ${goal.title}`
          : `Cheer ${recipient.name}'s day`
      }
      presets={goal ? habitCheerPresets(goal.title) : DAY_CHEER_PRESETS}
      maxLength={MAX_CHEER_LENGTH}
      inputLabel="Cheer message"
      isVisible={isVisible}
      isPending={isPending}
      onClose={onClose}
      onSend={send}
    />
  );
}
