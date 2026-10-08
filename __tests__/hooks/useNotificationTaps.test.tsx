import { act, render } from "@testing-library/react-native";
import type { Session } from "@supabase/supabase-js";
import { QueryClientProvider } from "@tanstack/react-query";

import {
  SupabaseContext,
  SupabaseContextValue,
} from "@/context/supabase-context";
import {
  useForgetTapsWhileSignedOut,
  useNotificationTaps,
} from "@/hooks/useNotificationTaps";
import { onShowMyTab } from "@/lib/notificationTaps";
import type { NotificationTap } from "@/lib/push";

import {
  buildFakeSupabase,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

// The native half (reading and clearing the tap) is `lib/push`'s and has its
// own tests; the gates are their own hooks' and are stubbed to the state each
// case needs.
jest.mock("@/lib/push", () => ({
  getLastNotificationTap: jest.fn(() => null),
  clearLastNotificationTap: jest.fn(),
  onNotificationTap: jest.fn(() => () => {}),
}));
jest.mock("@/hooks/useNameGate", () => ({ useNameGate: jest.fn() }));
jest.mock("@/hooks/useActiveGroup", () => ({ useActiveGroup: jest.fn() }));

const push = require("@/lib/push") as {
  getLastNotificationTap: jest.Mock;
  clearLastNotificationTap: jest.Mock;
  onNotificationTap: jest.Mock;
};
const { useNameGate } = require("@/hooks/useNameGate") as {
  useNameGate: jest.Mock;
};
const { useActiveGroup } = require("@/hooks/useActiveGroup") as {
  useActiveGroup: jest.Mock;
};
const { __router: router } = require("expo-router") as {
  __router: { navigate: jest.Mock };
};

// Every test gets its own ids: which taps were handled is module state, kept
// for the life of the JS runtime on purpose.
let seq = 0;
const nudgeTap = (extra: Record<string, unknown> = {}): NotificationTap => {
  seq += 1;
  return {
    id: `tap-${seq}`,
    data: { type: "nudge", notification_id: `row-${seq}`, ...extra },
  };
};

type Gates = {
  nameResolved?: boolean;
  needsName?: boolean;
  groupLoading?: boolean;
  hasNoGroup?: boolean;
};

function setGates({
  nameResolved = true,
  needsName = false,
  groupLoading = false,
  hasNoGroup = false,
}: Gates = {}) {
  useNameGate.mockReturnValue({ isResolved: nameResolved, needsName });
  useActiveGroup.mockReturnValue({ loading: groupLoading, hasNoGroup });
}

function Taps() {
  useNotificationTaps();
  return null;
}

function SignedOutGuard({ signedIn }: { signedIn: boolean }) {
  useForgetTapsWhileSignedOut();
  return signedIn ? <Taps /> : null;
}

function renderWith(
  ui: React.ReactElement,
  { signedIn = true, isLoaded = true } = {},
) {
  const update = makeQueryBuilder({ error: null });
  const from = jest.fn(() => update);
  const supabase = buildFakeSupabase({ fromImpl: from });
  const queryClient = makeQueryClient();
  const value = (signed: boolean, loaded: boolean): SupabaseContextValue => ({
    supabase,
    session: signed ? ({ user: { id: "user-1" } } as Session) : null,
    isLoaded: loaded,
    signOut: jest.fn(),
  });
  const Tree = ({
    signed,
    loaded,
    child,
  }: {
    signed: boolean;
    loaded: boolean;
    child: React.ReactElement;
  }) => (
    <QueryClientProvider client={queryClient}>
      <SupabaseContext.Provider value={value(signed, loaded)}>
        {child}
      </SupabaseContext.Provider>
    </QueryClientProvider>
  );
  const view = render(<Tree signed={signedIn} loaded={isLoaded} child={ui} />);
  return {
    ...view,
    from,
    update,
    rerenderWith: (signed: boolean, child: React.ReactElement, loaded = true) =>
      view.rerender(<Tree signed={signed} loaded={loaded} child={child} />),
  };
}

// The listener `useNotificationTaps` registered last, i.e. a live tap.
const liveTap = (tap: NotificationTap) => {
  const calls = push.onNotificationTap.mock.calls;
  act(() => calls[calls.length - 1][0](tap));
};

let showMyTab: jest.Mock;
let offShowMyTab: () => void;

beforeEach(() => {
  jest.clearAllMocks();
  push.getLastNotificationTap.mockReturnValue(null);
  push.onNotificationTap.mockImplementation(() => () => {});
  setGates();
  showMyTab = jest.fn();
  offShowMyTab = onShowMyTab(showMyTab);
});
afterEach(() => offShowMyTab());

describe("useNotificationTaps", () => {
  it("opens the dashboard on your own tab when a nudge launched the app", () => {
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    renderWith(<Taps />);

    expect(router.navigate).toHaveBeenCalledWith("/");
    expect(showMyTab).toHaveBeenCalledTimes(1);
  });

  it("opens your own tab for a nudge tapped while the app is running", () => {
    renderWith(<Taps />);
    expect(router.navigate).not.toHaveBeenCalled();

    liveTap(nudgeTap());

    expect(router.navigate).toHaveBeenCalledWith("/");
    expect(showMyTab).toHaveBeenCalledTimes(1);
  });

  it("marks the tapped notification as read", () => {
    const tap = nudgeTap();
    push.getLastNotificationTap.mockReturnValue(tap);
    const { from, update } = renderWith(<Taps />);

    expect(from).toHaveBeenCalledWith("notifications");
    expect(update.update).toHaveBeenCalledWith({
      read_at: expect.any(String),
    });
    expect(update.eq).toHaveBeenCalledWith("id", tap.data.notification_id);
  });

  it("still opens the dashboard when the push carries no notification id", () => {
    push.getLastNotificationTap.mockReturnValue({
      id: "tap-no-row",
      data: { type: "nudge" },
    });
    const { from } = renderWith(<Taps />);

    expect(from).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith("/");
  });

  it("clears the launch tap once handled, so a reload doesn't replay it", () => {
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    renderWith(<Taps />);
    expect(push.clearLastNotificationTap).toHaveBeenCalledTimes(1);
  });

  it("routes a tap once, however often the hook mounts again", () => {
    const tap = nudgeTap();
    push.getLastNotificationTap.mockReturnValue(tap);
    const first = renderWith(<Taps />);
    first.unmount();
    renderWith(<Taps />);
    liveTap(tap);

    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(showMyTab).toHaveBeenCalledTimes(1);
  });

  it("waits for the name and the group to be read, then routes", () => {
    setGates({ nameResolved: false, groupLoading: true });
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    const view = renderWith(<Taps />);
    expect(router.navigate).not.toHaveBeenCalled();

    setGates({ groupLoading: true });
    view.rerenderWith(true, <Taps />);
    expect(router.navigate).not.toHaveBeenCalled();

    setGates();
    view.rerenderWith(true, <Taps />);
    expect(router.navigate).toHaveBeenCalledWith("/");
  });

  it("leaves a user who still owes a name on the name screen", () => {
    setGates({ needsName: true });
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    const { from } = renderWith(<Taps />);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(showMyTab).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("notifications");
  });

  it("leaves a user with no group on the join-group screen", () => {
    setGates({ hasNoGroup: true });
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    const { from } = renderWith(<Taps />);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(showMyTab).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("notifications");
  });

  it("opens your own tab for a habit reminder, like a nudge", () => {
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({ type: "reminder", goal_id: "goal-1", group_id: "group-1" }),
    );
    renderWith(<Taps />);

    expect(router.navigate).toHaveBeenCalledWith("/");
    expect(showMyTab).toHaveBeenCalledTimes(1);
  });

  it("just opens the app for a notification that isn't a nudge or a reminder", () => {
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({ type: "buddy_done" }),
    );
    const { from } = renderWith(<Taps />);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(showMyTab).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("notifications");
  });
});

describe("useForgetTapsWhileSignedOut", () => {
  it("forgets a tap that opened the app signed out, even after signing in", () => {
    const tap = nudgeTap();
    push.getLastNotificationTap.mockReturnValue(tap);
    const view = renderWith(<SignedOutGuard signedIn={false} />, {
      signedIn: false,
    });
    expect(push.clearLastNotificationTap).toHaveBeenCalled();

    view.rerenderWith(true, <SignedOutGuard signedIn />);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(showMyTab).not.toHaveBeenCalled();
  });

  it("forgets a tap made while signed out with the app running", () => {
    const view = renderWith(<SignedOutGuard signedIn={false} />, {
      signedIn: false,
    });
    const tap = nudgeTap();
    liveTap(tap);
    push.getLastNotificationTap.mockReturnValue(tap);

    view.rerenderWith(true, <SignedOutGuard signedIn />);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("leaves the tap alone until the stored session has been read", () => {
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    const view = renderWith(<SignedOutGuard signedIn={false} />, {
      signedIn: false,
      isLoaded: false,
    });
    expect(push.clearLastNotificationTap).not.toHaveBeenCalled();

    // The stored session turns out to be signed in: the tap is still routed.
    view.rerenderWith(true, <SignedOutGuard signedIn />);
    expect(router.navigate).toHaveBeenCalledWith("/");
  });
});
