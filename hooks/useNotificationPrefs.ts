import { Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSupabase } from "@/hooks/useSupabase";
import { error as errorHaptic } from "@/lib/haptics";
import { queryKeys } from "@/lib/queryKeys";

/**
 * `public.notification_prefs`, one row per account — unlike the accent colour
 * and the haptics switch, which are per device.
 */
export interface NotificationPrefs {
  reminders_enabled: boolean;
  nudges_enabled: boolean;
  social_enabled: boolean;
  timezone: string;
  quiet_start: string | null;
  quiet_end: string | null;
}

const COLUMNS =
  "reminders_enabled, nudges_enabled, social_enabled, timezone, quiet_start, quiet_end";

/**
 * Read and change the signed-in user's notification preferences.
 *
 * Hand-rolled for the same reason `useUpdateProfile` is: the shared goal
 * mutation hard-codes the `groupMembers` cache. This follows the same shape —
 * cancel, snapshot, patch, roll back with an Alert, invalidate on settle.
 *
 * An **update**, never an upsert: the row is created by a trigger on
 * `auth.users` and there is no client INSERT policy, so an upsert would be
 * rejected rather than helpful.
 */
export function useNotificationPrefs() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const prefsKey = queryKeys.notificationPrefs(userId);

  const query = useQuery({
    queryKey: prefsKey,
    enabled: !!userId,
    queryFn: async (): Promise<NotificationPrefs | null> => {
      const { data, error } = await supabase
        .from("notification_prefs")
        .select(COLUMNS)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as NotificationPrefs | null) ?? null;
    },
  });

  const mutation = useMutation({
    mutationFn: async (patch: Partial<NotificationPrefs>) => {
      if (!userId) throw new Error("No user");
      const { error } = await supabase
        .from("notification_prefs")
        .update(patch)
        .eq("user_id", userId);
      if (error) throw error;
    },
    // The switch moves now. A toggle that waits out a round trip reads as a
    // broken switch, and the round trip is the whole interaction here.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: prefsKey });
      const previous = queryClient.getQueryData<NotificationPrefs | null>(
        prefsKey,
      );
      if (previous) {
        queryClient.setQueryData<NotificationPrefs>(prefsKey, {
          ...previous,
          ...patch,
        });
      }
      return { previous };
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(prefsKey, ctx.previous);
      }
      errorHaptic();
      Alert.alert(
        "Couldn't save that",
        err instanceof Error ? err.message : "Please try again.",
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: prefsKey });
    },
  });

  return {
    // `null` is "no row read yet", not "everything off" — the screen renders
    // the switches from this, and defaults would flash the wrong answer.
    prefs: query.data ?? null,
    isLoading: query.isLoading,
    setPref: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
