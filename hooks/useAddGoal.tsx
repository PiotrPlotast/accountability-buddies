import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";
import { Alert } from "react-native";
import { Member, Goal } from "@/types/dashboardTypes";

interface AddGoalParams {
  title: string;
  groupId: string;
}

export function useAddGoal() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, groupId }: AddGoalParams) => {
      if (!title.trim() || !userId || !groupId)
        throw new Error("Invalid params");

      const { data, error } = await supabase
        .from("goals")
        .insert({ title: title.trim(), user_id: userId, group_id: groupId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ title, groupId }: AddGoalParams) => {
      // 1. Cancel queries to avoid overwriting optimistic state
      await queryClient.cancelQueries({ queryKey: ["groupMembers", groupId] });

      // 2. Preserve the previous state for rollback
      const previousMembers = queryClient.getQueryData<Member[]>([
        "groupMembers",
        groupId,
      ]);

      // 3. Check userId (Type Guard for TS)
      if (!userId) return { previousMembers };

      const optimisticGoal: Goal = {
        id: `temp-${Date.now()}`,
        title: title.trim(),
        user_id: userId,
        group_id: groupId,
        completed_today: false,
      };

      // 5. Update cache
      queryClient.setQueryData<Member[]>(["groupMembers", groupId], (old) => {
        if (!old) return [];
        return old.map((m) => {
          if (m.user_id !== userId) return m;
          return {
            ...m,
            goals: [...(m.goals || []), optimisticGoal],
          };
        });
      });

      return { previousMembers };
    },
    onError: (error: unknown, { groupId }, context) => {
      // Rollback in case of error
      if (context?.previousMembers) {
        queryClient.setQueryData(
          ["groupMembers", groupId],
          context.previousMembers,
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert("Error", message);
    },
    onSettled: (data, error, { groupId }) => {
      // Refresh data from server to replace temp-id with real id from database
      queryClient.invalidateQueries({ queryKey: ["groupMembers", groupId] });
    },
  });
}
