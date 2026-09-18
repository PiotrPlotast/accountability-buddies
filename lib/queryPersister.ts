import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

/**
 * The AsyncStorage mirror of the query cache.
 *
 * Its own module because two places need the same instance: `app/_layout.tsx`
 * hands it to `PersistQueryClientProvider`, and `providers/supabase-provider`
 * tears it down on sign-out. Built at module scope, like the `QueryClient`
 * beside it — one per app, not one per render.
 */
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
});
