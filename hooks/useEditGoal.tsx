import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";
import { Alert } from "react-native";
import { Member } from "@/types/dashboardTypes";

interface EditGoalParams {
  goalId: string;
  newTitle: string;
  groupId: string;
}

export function useEditGoal() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId, newTitle, groupId }: EditGoalParams) => {
      if (!goalId || !newTitle.trim() || !userId)
        throw new Error("Invalid params");

      const { error } = await supabase
        .from("goals")
        .update({ title: newTitle.trim() })
        .eq("id", goalId)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onMutate: async ({ goalId, newTitle, groupId }: EditGoalParams) => {
      // Optimistic update
      queryClient.setQueryData<Member[]>(["groupMembers", groupId], (old) => {
        if (!old) return old;
        return old.map((m) => {
          if (m.user_id !== userId) return m;
          return {
            ...m,
            goals: m.goals.map((g) =>
              g.id === goalId ? { ...g, title: newTitle.trim() } : g,
            ),
          };
        });
      });
    },
    onError: (error: unknown, { groupId }) => {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert("Error", message);
      // Rollback
      queryClient.invalidateQueries({ queryKey: ["groupMembers", groupId] });
    },
    onSettled: (_data, _error, _variables) => {
      queryClient.invalidateQueries({ queryKey: ["groupMembers"] });
    },
  });
}
