import { QueryClient } from "@tanstack/react-query";

/**
 * The app's one `QueryClient`, built by `app/_layout.tsx` at module scope.
 *
 * `retry: 1`: a failed read is tried once more and then shown as failed (the
 * dashboard's offline banner or retry screen). supabase-js's own read retries
 * are off (`db.retry` in the provider), so this is the only retry layer —
 * stacked, the two kept an offline pull-to-refresh spinning for half a minute.
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 60 * 24, // 24 godziny
        staleTime: 1000 * 60 * 5, // 5 minut
        retry: 1,
      },
    },
  });
}
