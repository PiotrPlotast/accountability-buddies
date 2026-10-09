import { Text } from "react-native";

/**
 * Said under an action that only the server can do, while the phone is
 * offline. Changes to your own habits queue instead; these can't, because
 * someone else (a buddy, the group) has to see them or they decide something.
 */
export default function NeedsConnection({
  className = "",
}: {
  className?: string;
}) {
  return (
    <Text
      className={`text-text-muted font-mono text-xs text-center mt-2 ${className}`}
    >
      Needs a connection
    </Text>
  );
}
