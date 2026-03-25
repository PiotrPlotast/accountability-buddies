import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";
import { Alert } from "react-native";
import { Member } from "@/types/dashboardTypes";

interface DeleteGoalParams {
  goalId: string;
  groupId: string;
}

export function useDeleteGoal() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId, groupId }: DeleteGoalParams) => {
      if (!goalId || !userId || !groupId) throw new Error("Invalid params");

      const { data, error } = await supabase
        .from("goals")
        .delete()
        .eq("id", goalId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      if (!data)
        throw new Error(
          "Could not delete this goal. You might not have permission.",
        );
      return data;
    },
    onMutate: async ({ goalId, groupId }: DeleteGoalParams) => {
      // Optimistic remove
      queryClient.setQueryData<Member[]>(["groupMembers", groupId], (old) => {
        if (!old) return old;
        return old.map((m) => {
          if (m.user_id !== userId) return m;
          return {
            ...m,
            goals: m.goals.filter((g) => g.id !== goalId),
          };
        });
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert("Error", message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["groupMembers"] });
    },
  });
}
