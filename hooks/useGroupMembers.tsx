import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/useSupabase";
import { useTodayLocalDate } from "@/hooks/useTodayLocalDate";
import { HabitPhoto, Member } from "@/types/dashboardTypes";
import { getRecentLocalDates } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { HISTORY_DAYS } from "@/lib/goalHistory";
import { toHHMM } from "@/lib/reminderTime";

type PhotoRow = {
  id: string;
  storage_path: string;
  created_at: string;
  removed_at: string | null;
};

// At most one row per habit is visible: one photo per habit per day, and only
// today's.
function toHabitPhoto(row: PhotoRow | undefined): HabitPhoto | null {
  if (!row) return null;
  return {
    id: row.id,
    path: row.storage_path,
    createdAt: row.created_at,
    removed: row.removed_at !== null,
  };
}

interface UseGroupMembersProps {
  groupId: string | null;
}

/**
 * The newest entry cached for this group on another day, re-read against
 * `today`: the same members and habits, ticked only where a log is dated
 * today. It fills the gap while the new day's read is in flight — or offline,
 * for as long as that takes — so midnight unticks the boxes at once instead
 * of blanking the list or keeping yesterday's ticks up.
 */
function carryOver(
  cached: [readonly unknown[], Member[] | undefined][],
  today: string,
): Member[] | undefined {
  const latest = cached
    .filter(([key, data]) => key[2] !== today && data)
    .sort(([a], [b]) => String(b[2]).localeCompare(String(a[2])))[0]?.[1];

  return latest?.map((m) => ({
    ...m,
    goals: m.goals.map((g) => ({
      ...g,
      completed_today: (g.completed_dates ?? []).includes(today),
      // A photo belongs to the day it was taken, which this entry isn't.
      photo: null,
    })),
  }));
}

export function useGroupMembers({ groupId }: UseGroupMembersProps) {
  const { supabase } = useSupabase();
  const queryClient = useQueryClient();
  // Re-renders at local midnight and on return to the foreground, moving the
  // query onto the new day's key.
  const today = useTodayLocalDate();

  return useQuery({
    queryKey: queryKeys.groupMembers(groupId, today),
    queryFn: async (): Promise<Member[]> => {
      if (!groupId) return [];

      // Widened from a single day so each habit row can show a real trailing
      // week instead of only "done today".
      const windowStart = getRecentLocalDates(HISTORY_DAYS, today)[0];

      const [membersRes, goalsRes] = await Promise.all([
        supabase
          .from("group_members")
          .select("user_id, profiles(full_name)")
          .eq("group_id", groupId),
        supabase
          .from("goals")
          .select(
            // `habit_photos` needs no date filter: the server only shows a
            // photo on the poster's own day (`habit_photo_is_visible`), which
            // need not be the viewer's.
            "id,user_id,title,group_id,icon,repeat_days,reminder_time,logs(id,date),habit_photos(id,storage_path,created_at,removed_at)",
          )
          .eq("group_id", groupId)
          .gte("logs.date", windowStart)
          .lte("logs.date", today),
      ]);

      // Throw rather than falling back to `[]`: an empty array is a valid
      // result that React Query caches and persists for 24h, so swallowing a
      // network or RLS failure here renders as "this group has no members"
      // with no way for the UI to tell the difference or retry.
      if (membersRes.error) throw membersRes.error;
      if (goalsRes.error) throw goalsRes.error;

      const memberRows = membersRes.data ?? [];
      const goalRows = goalsRes.data ?? [];

      const formattedMembers: Member[] = memberRows.map((m) => {
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        return {
          user_id: m.user_id,
          full_name: profile?.full_name || "Unknown",
          goals: goalRows
            .filter((g) => g.user_id === m.user_id)
            .map(({ logs, reminder_time, habit_photos, ...g }) => {
              const completed_dates = [
                ...new Set(logs.map((l) => l.date)),
              ].sort();
              return {
                ...g,
                reminder_time: toHHMM(reminder_time),
                completed_dates,
                completed_today: completed_dates.includes(today),
                photo: toHabitPhoto(habit_photos?.[0]),
              };
            }),
        };
      });

      return formattedMembers;
    },
    placeholderData: () =>
      carryOver(
        queryClient.getQueriesData<Member[]>({
          queryKey: queryKeys.groupMembersOfGroup(groupId),
        }),
        today,
      ),
    enabled: !!groupId,
  });
}
