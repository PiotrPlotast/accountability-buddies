import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

import { useSupabase } from "@/hooks/useSupabase";
import { errorMessage } from "@/lib/errorMessage";
import { destructive, error as errorBuzz } from "@/lib/haptics";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Leave the group you're in.
 *
 * One RPC, `leave_group()`, never a delete on `group_members`: the server
 * detaches your habits (they follow you into your next group), hands the
 * creator's role on or deletes the group when you were the last one, all in
 * the same transaction as the delete. Not optimistic, like `useDeleteAccount`:
 * there is nothing to roll back to that the user would want to see.
 *
 * On success the stats answer becomes "no group", which is what
 * `useDashboardData` redirects to join-group on.
 */
export function useLeaveGroup() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("leave_group");
      if (error) throw error;
      const result = data as { success: boolean; message?: string } | null;
      if (!result?.success) {
        throw new Error(result?.message ?? "Couldn't leave the group.");
      }
    },
    // The buzz belongs to the confirming tap, as for deleting the account.
    onMutate: () => {
      destructive();
    },
    onSuccess: async () => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.groupStatsAll(),
      });
      queryClient.setQueryData(queryKeys.groupStats(userId), null);
      queryClient.removeQueries({ queryKey: queryKeys.groupMembersAll() });
    },
    onError: (err) => {
      errorBuzz();
      Alert.alert("Couldn't leave the group", errorMessage(err));
    },
  });
}
