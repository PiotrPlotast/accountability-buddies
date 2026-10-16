import { Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";

import { useSupabase } from "@/hooks/useSupabase";
import { celebrate, error as errorHaptic } from "@/lib/haptics";

type SendCheerParams = {
  recipientId: string;
  message: string;
  // Set for a habit cheer, null for a day cheer.
  goalId: string | null;
  // The day the cheer is about; null leaves it to the server's today.
  day: string | null;
};

type SendCheerResult = { success: boolean; message: string };

const CONNECTION_MESSAGE =
  "Couldn't send that cheer. Check your connection and try again.";

/**
 * One cheer through the send-cheer Edge Function: `useSendNudge`'s twin, for
 * the same reasons. Nothing in the cache changes, and `celebrate()` waits for
 * the server, because the once-a-day limits may still refuse it.
 */
export function useSendCheer() {
  const { supabase } = useSupabase();

  return useMutation({
    mutationFn: async ({
      recipientId,
      message,
      goalId,
      day,
    }: SendCheerParams) => {
      const { data, error } = await supabase.functions.invoke<SendCheerResult>(
        "send-cheer",
        {
          body: { recipient_id: recipientId, message, goal_id: goalId, day },
        },
      );
      if (error || !data) throw new Error(CONNECTION_MESSAGE);
      if (!data.success) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      celebrate();
    },
    onError: (e) => {
      errorHaptic();
      Alert.alert("Cheer not sent", e.message);
    },
  });
}
