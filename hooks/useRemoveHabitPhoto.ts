import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSupabase } from "@/hooks/useSupabase";
import { errorMessage } from "@/lib/errorMessage";
import { error as errorHaptic } from "@/lib/haptics";
import { queryKeys } from "@/lib/queryKeys";
import { Member } from "@/types/dashboardTypes";

type RemoveHabitPhotoParams = { photoId: string; groupId: string };
type RemoveResult = { success: boolean; message: string };

/**
 * The owner deleting their photo, through `remove_habit_photo`. Final: the
 * photo is marked removed, not dropped, because the day's photo stays used
 * and the camera must not come back for that habit.
 */
export function useRemoveHabitPhoto() {
  const { supabase } = useSupabase();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ photoId }: RemoveHabitPhotoParams) => {
      const { data, error } = await supabase.rpc("remove_habit_photo", {
        p_id: photoId,
      });
      const result = data as RemoveResult | null;
      if (error) throw error;
      if (!result?.success) throw new Error(result?.message);
      return result;
    },
    onSuccess: (_data, { photoId, groupId }) => {
      queryClient.setQueriesData<Member[]>(
        { queryKey: queryKeys.groupMembersOfGroup(groupId) },
        (members) =>
          members?.map((m) => ({
            ...m,
            goals: m.goals.map((g) =>
              g.photo?.id === photoId
                ? { ...g, photo: { ...g.photo, removed: true } }
                : g,
            ),
          })),
      );
      return queryClient.invalidateQueries({
        queryKey: queryKeys.groupMembersOfGroup(groupId),
      });
    },
    onError: (e) => {
      errorHaptic();
      Alert.alert(
        "Photo not deleted",
        errorMessage(e, "Couldn't delete that photo. Try again."),
      );
    },
  });
}
