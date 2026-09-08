import { useProfile } from "@/hooks/useProfile";
import { hasDisplayName } from "@/lib/displayName";

/**
 * Whether the signed-in user still owes us a display name.
 *
 * `(protected)/_layout.tsx` swaps the whole app out for the name screen on
 * `needsName`, the same way the root layout swaps `(protected)` for
 * `(public)` on the session. A guard rather than a redirect effect, so the
 * dashboard never mounts for a nameless user and there is no second effect to
 * race the join-group redirect.
 *
 * `isResolved` matters because "not read yet" and "has no name" must not look
 * alike: reporting `needsName` while the query is in flight would flash the
 * name screen at every returning user with a cold cache. Both stay false
 * until the profile is known.
 */
export function useNameGate() {
  const { data, isFetched } = useProfile();

  return {
    isResolved: isFetched,
    needsName: isFetched && !hasDisplayName(data),
  };
}
