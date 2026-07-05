import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

import { useSupabase } from "@/hooks/useSupabase";
import { queryKeys } from "@/lib/queryKeys";
import { GroupResult } from "@/types/dashboardTypes";

interface UpdateGroupParams {
  groupId: string;
  name?: string;
  icon?: string;
}

export function useUpdateGroup() {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const statsKey = queryKeys.groupStats(userId);

  return useMutation({
    mutationFn: async ({ groupId, name, icon }: UpdateGroupParams) => {
      const updates: Record<string, string> = {};
      if (name !== undefined) updates.name = name.trim();
      if (icon !== undefined) updates.icon = icon;
      if (Object.keys(updates).length === 0) return;

      const { error } = await supabase
        .from("groups")
        .update(updates)
        .eq("id", groupId);
      if (error) throw error;
    },
    onMutate: async ({ name, icon }) => {
      await queryClient.cancelQueries({ queryKey: statsKey });
      const previous = queryClient.getQueryData<GroupResult | null>(statsKey);
      if (previous) {
        queryClient.setQueryData<GroupResult>(statsKey, {
          ...previous,
          name: name !== undefined ? name.trim() : previous.name,
          icon: icon !== undefined ? icon : previous.icon,
        });
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(statsKey, ctx.previous);
      }
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not save group changes.",
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: statsKey });
    },
  });
}
