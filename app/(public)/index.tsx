import { Redirect } from "expo-router";

// A cold start opens at `/`, which only the dashboard answers, and the session
// guard hides it while signed out: a fresh install showed "Unmatched Route".
// Signed out, `/` means welcome. Signed in this group is guarded out, so `/` is
// still the dashboard.
export default function PublicIndex() {
  return <Redirect href="/welcome" />;
}
