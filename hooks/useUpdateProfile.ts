import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

import { useSupabase } from "@/hooks/useSupabase";
import { isValidName, normalizeName } from "@/lib/displayName";
import { queryKeys } from "@/lib/queryKeys";
import { ProfileRow } from "@/types/dashboardTypes";

interface UpdateProfileParams {
  fullName: string;
}

/**
 * Change the signed-in user's display name.
 *
 * Hand-rolled rather than built on `lib/useOptimisticGoalMutation.ts`: that
 * hook hard-codes the `groupMembers` cache and "patch my own goals", neither
 * of which applies here. `useUpdateGroup` is the shape this follows —
 * cancel, snapshot, patch, roll back with an Alert, invalidate on settle.
 */
export function useUpdateProfile() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const profileKey = queryKeys.profile(userId);

  return useMutation({
    mutationFn: async ({ fullName }: UpdateProfileParams) => {
      if (!userId) throw new Error("No user");
      // Validate before the round trip, so an unsavable name never reaches
      // the optimistic patch and briefly blanks the name everywhere.
      if (!isValidName(fullName)) throw new Error("Enter a name.");

      const { data, error } = await supabase
        .from("profiles")
        .update({ full_name: normalizeName(fullName) })
        .eq("id", userId)
        .select("id");

      if (error) throw error;
      // `profiles` grants UPDATE only — the signup trigger owns the INSERT.
      // A zero-row update therefore means the row never arrived, and an
      // upsert wouldn't help. Fail loudly rather than let the name gate wave
      // through a user whose name was never stored.
      if (!data || data.length === 0) {
        throw new Error("Your profile isn't ready yet. Please try again.");
      }
    },
    onMutate: async ({ fullName }) => {
      await queryClient.cancelQueries({ queryKey: profileKey });
      const previous = queryClient.getQueryData<ProfileRow | null>(profileKey);
      queryClient.setQueryData<ProfileRow>(profileKey, {
        avatar_url: previous?.avatar_url ?? null,
        full_name: normalizeName(fullName),
      });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(profileKey, ctx.previous);
      }
      Alert.alert(
        "Couldn't save your name",
        err instanceof Error ? err.message : "Please try again.",
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKey });
    },
  });
}
