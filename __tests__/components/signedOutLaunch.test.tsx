import { Stack } from "expo-router";
import { renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";

// The real router, not the global mock: what is under test is which screen a
// URL resolves to on a cold start.
jest.unmock("expo-router");

/**
 * The app's route tree, with stand-in screens. The root mirrors the session
 * guard in `app/_layout.tsx`; the signed-out group's layout and index are the
 * real files, because they decide where `/` goes while signed out.
 */
function routes(signedIn: boolean) {
  return {
    _layout: () => (
      <Stack>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(protected)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(public)" />
        </Stack.Protected>
      </Stack>
    ),
    "(protected)/_layout": () => <Stack />,
    "(protected)/(tabs)/_layout": () => <Stack />,
    "(protected)/(tabs)/index": () => <Text>dashboard</Text>,
    "(protected)/join-group": () => <Text>join group</Text>,
    "(public)/_layout": require("@/app/(public)/_layout"),
    "(public)/index": require("@/app/(public)/index"),
    "(public)/welcome": () => <Text>welcome</Text>,
    "(public)/sign-in": () => <Text>sign in</Text>,
    "(public)/sign-up": () => <Text>sign up</Text>,
  };
}

describe("a cold start", () => {
  // A fresh install has no session and opens at `/`, which only the dashboard
  // answers; signed out, that showed expo-router's "Unmatched Route".
  it("opens on welcome when signed out", async () => {
    await renderRouter(routes(false), { initialUrl: "/" });

    expect(screen.getByText("welcome")).toBeTruthy();
    expect(screen.queryByText("Unmatched Route")).toBeNull();
  });

  it("still opens on the dashboard when signed in", async () => {
    await renderRouter(routes(true), { initialUrl: "/" });

    expect(screen.getByText("dashboard")).toBeTruthy();
  });

  it.each([
    ["/sign-in", "sign in"],
    ["/sign-up", "sign up"],
  ])("still opens %s when signed out", async (url, text) => {
    await renderRouter(routes(false), { initialUrl: url });

    expect(screen.getByText(text)).toBeTruthy();
  });

  it("still opens a signed-in route when signed in", async () => {
    await renderRouter(routes(true), { initialUrl: "/join-group" });

    expect(screen.getByText("join group")).toBeTruthy();
  });
});
