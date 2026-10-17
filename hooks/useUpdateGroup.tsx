import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSupabase } from "@/hooks/useSupabase";
import { optimisticPatchOptions } from "@/lib/optimisticPatch";
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
    ...optimisticPatchOptions<GroupResult, UpdateGroupParams>({
      queryClient,
      queryKey: statsKey,
      patch: (previous, { name, icon }) =>
        previous
          ? {
              ...previous,
              name: name !== undefined ? name.trim() : previous.name,
              icon: icon !== undefined ? icon : previous.icon,
            }
          : undefined,
      fallback: "Could not save group changes.",
    }),
  });
}
