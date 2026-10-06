import { Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";

import { useSupabase } from "@/hooks/useSupabase";
import { celebrate, error as errorHaptic } from "@/lib/haptics";

type SendNudgeParams = { recipientId: string; message: string };

type SendNudgeResult = { success: boolean; message: string };

const CONNECTION_MESSAGE =
  "Couldn't send that nudge. Check your connection and try again.";

/**
 * One nudge through the send-nudge Edge Function. Not optimistic and not
 * through `useOptimisticGoalMutation`: nothing in the cache changes, and the
 * sender only learns whether it went once the server has applied its rules.
 *
 * The `celebrate()` buzz waits for that answer. It is the one haptic that
 * follows the server rather than the touch: a buzz on the tap would confirm a
 * nudge the limits may still refuse.
 */
export function useSendNudge() {
  const { supabase } = useSupabase();

  return useMutation({
    mutationFn: async ({ recipientId, message }: SendNudgeParams) => {
      const { data, error } = await supabase.functions.invoke<SendNudgeResult>(
        "send-nudge",
        { body: { recipient_id: recipientId, message } },
      );
      if (error || !data) throw new Error(CONNECTION_MESSAGE);
      // The server's own words: the limits name what happened, and every
      // recipient-side refusal already reads "Couldn't deliver that nudge".
      if (!data.success) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      celebrate();
    },
    onError: (e) => {
      errorHaptic();
      Alert.alert("Nudge not sent", e.message);
    },
  });
}
