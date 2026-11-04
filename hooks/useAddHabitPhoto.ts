import { Alert } from "react-native";
import { randomUUID } from "expo-crypto";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSupabase } from "@/hooks/useSupabase";
import { prepareForUpload } from "@/lib/camera";
import { errorMessage } from "@/lib/errorMessage";
import { PHOTO_BUCKET, photoPath } from "@/lib/habitPhotos";
import { celebrate, error as errorHaptic } from "@/lib/haptics";
import { queryKeys } from "@/lib/queryKeys";

type AddHabitPhotoParams = {
  goalId: string;
  groupId: string;
  // The day the habit was ticked, `YYYY-MM-DD`, as `logs.date`.
  day: string;
  // The photo the camera took, on the phone.
  uri: string;
};

type AttachResult = { success: boolean; message: string; photo_id?: string };

/**
 * Posts a habit's photo: upload to the private bucket, then
 * `attach_habit_photo`, which ties the file to the habit and the day.
 *
 * A plain `useMutation`, not a goal mutation: a photo needs the server (the
 * camera is offered online only), so nothing is queued or patched
 * optimistically, and the dashboard reads the photo back on success. A
 * refused attach takes its upload back rather than leaving it for the
 * cleanup job. Like a nudge, `celebrate()` waits for the server's yes.
 */
export function useAddHabitPhoto() {
  const { supabase, session } = useSupabase();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async ({ goalId, day, uri }: AddHabitPhotoParams) => {
      if (!userId) throw new Error("Not signed in.");
      const bytes = await prepareForUpload(uri);
      const path = photoPath(userId, goalId, day, randomUUID());
      const bucket = supabase.storage.from(PHOTO_BUCKET);

      const upload = await bucket.upload(path, bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (upload.error) throw upload.error;

      const { data, error } = await supabase.rpc("attach_habit_photo", {
        p_goal: goalId,
        p_day: day,
        p_path: path,
      });
      const result = data as AttachResult | null;
      if (error || !result?.success) {
        // Best effort: a file nobody attached is reclaimed later anyway.
        await bucket.remove([path]).catch(() => {});
        throw error ?? new Error(result?.message);
      }
      return result;
    },
    onSuccess: (_data, { groupId }) => {
      celebrate();
      return queryClient.invalidateQueries({
        queryKey: queryKeys.groupMembersOfGroup(groupId),
      });
    },
    onError: (e) => {
      errorHaptic();
      Alert.alert(
        "Photo not posted",
        errorMessage(e, "Couldn't post that photo. Try again."),
      );
    },
  });
}
