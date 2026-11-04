import { useQuery } from "@tanstack/react-query";

import { useSupabase } from "@/hooks/useSupabase";
import { PHOTO_BUCKET, SIGNED_URL_SECONDS } from "@/lib/habitPhotos";
import { queryKeys } from "@/lib/queryKeys";

const EMPTY: Record<string, string> = {};

/**
 * Signed URLs for the group's photos, in one call: `path → url`. The bucket
 * is private and its read policy is "the row is visible", so a URL is only
 * ever handed out for a photo the viewer may see.
 *
 * Re-signed after 50 minutes, before the hour runs out. A URL that changes
 * doesn't re-download the picture: `PhotoImage` caches by path. A failure is
 * an empty map, never an error state — a missing thumbnail is not worth a
 * screen.
 */
export function useHabitPhotoUrls(paths: string[]): Record<string, string> {
  const { supabase } = useSupabase();
  const key = queryKeys.habitPhotoUrls(paths);

  const { data } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(key[1], SIGNED_URL_SECONDS);
      if (error || !data) return {};
      const urls: Record<string, string> = {};
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) {
          urls[item.path] = item.signedUrl;
        }
      }
      return urls;
    },
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
  });

  return paths.length > 0 && data ? data : EMPTY;
}
