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
import { onCheerRequest, onShowTab } from "@/lib/notificationTaps";
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

async function renderWith(
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
  const view = await render(
    <Tree signed={signedIn} loaded={isLoaded} child={ui} />,
  );
  return {
    ...view,
    from,
    update,
    rerenderWith: async (
      signed: boolean,
      child: React.ReactElement,
      loaded = true,
    ) =>
      await view.rerender(
        <Tree signed={signed} loaded={loaded} child={child} />,
      ),
  };
}

// The listener `useNotificationTaps` registered last, i.e. a live tap.
const liveTap = async (tap: NotificationTap) => {
  const calls = push.onNotificationTap.mock.calls;
  await act(() => calls[calls.length - 1][0](tap));
};

let showTab: jest.Mock;
let offShowTab: () => void;

beforeEach(() => {
  jest.clearAllMocks();
  push.getLastNotificationTap.mockReturnValue(null);
  push.onNotificationTap.mockImplementation(() => () => {});
  setGates();
  showTab = jest.fn();
  offShowTab = onShowTab(showTab);
});
afterEach(() => offShowTab());

describe("useNotificationTaps", () => {
  it("opens the dashboard on your own tab when a nudge launched the app", async () => {
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    await renderWith(<Taps />);

    expect(router.navigate).toHaveBeenCalledWith("/");
    expect(showTab).toHaveBeenCalledTimes(1);
    expect(showTab).toHaveBeenCalledWith(null);
  });

  it("opens your own tab for a nudge tapped while the app is running", async () => {
    await renderWith(<Taps />);
    expect(router.navigate).not.toHaveBeenCalled();

    await liveTap(nudgeTap());

    expect(router.navigate).toHaveBeenCalledWith("/");
    expect(showTab).toHaveBeenCalledTimes(1);
    expect(showTab).toHaveBeenCalledWith(null);
  });

  it("marks the tapped notification as read", async () => {
    const tap = nudgeTap();
    push.getLastNotificationTap.mockReturnValue(tap);
    const { from, update } = await renderWith(<Taps />);

    expect(from).toHaveBeenCalledWith("notifications");
    expect(update.update).toHaveBeenCalledWith({
      read_at: expect.any(String),
    });
    expect(update.eq).toHaveBeenCalledWith("id", tap.data.notification_id);
  });

  it("still opens the dashboard when the push carries no notification id", async () => {
    push.getLastNotificationTap.mockReturnValue({
      id: "tap-no-row",
      data: { type: "nudge" },
    });
    const { from } = await renderWith(<Taps />);

    expect(from).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith("/");
  });

  it("clears the launch tap once handled, so a reload doesn't replay it", async () => {
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    await renderWith(<Taps />);
    expect(push.clearLastNotificationTap).toHaveBeenCalledTimes(1);
  });

  it("routes a tap once, however often the hook mounts again", async () => {
    const tap = nudgeTap();
    push.getLastNotificationTap.mockReturnValue(tap);
    const first = await renderWith(<Taps />);
    await first.unmount();
    await renderWith(<Taps />);
    await liveTap(tap);

    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(showTab).toHaveBeenCalledTimes(1);
    expect(showTab).toHaveBeenCalledWith(null);
  });

  it("waits for the name and the group to be read, then routes", async () => {
    setGates({ nameResolved: false, groupLoading: true });
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    const view = await renderWith(<Taps />);
    expect(router.navigate).not.toHaveBeenCalled();

    setGates({ groupLoading: true });
    await view.rerenderWith(true, <Taps />);
    expect(router.navigate).not.toHaveBeenCalled();

    setGates();
    await view.rerenderWith(true, <Taps />);
    expect(router.navigate).toHaveBeenCalledWith("/");
  });

  it("leaves a user who still owes a name on the name screen", async () => {
    setGates({ needsName: true });
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    const { from } = await renderWith(<Taps />);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(showTab).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("notifications");
  });

  it("leaves a user with no group on the join-group screen", async () => {
    setGates({ hasNoGroup: true });
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    const { from } = await renderWith(<Taps />);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(showTab).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("notifications");
  });

  it("opens your own tab for a habit reminder, like a nudge", async () => {
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({ type: "reminder", goal_id: "goal-1", group_id: "group-1" }),
    );
    await renderWith(<Taps />);

    expect(router.navigate).toHaveBeenCalledWith("/");
    expect(showTab).toHaveBeenCalledTimes(1);
    expect(showTab).toHaveBeenCalledWith(null);
  });

  it.each(["buddy_ticked", "buddy_done", "member_joined"])(
    "opens the buddy's tab for %s",
    async (type) => {
      push.getLastNotificationTap.mockReturnValue(
        nudgeTap({ type, buddy_id: "user-2", group_id: "group-1" }),
      );
      await renderWith(<Taps />);

      expect(router.navigate).toHaveBeenCalledWith("/");
      expect(showTab).toHaveBeenCalledTimes(1);
      expect(showTab).toHaveBeenCalledWith("user-2");
    },
  );

  it("just opens the app for a buddy event that names no buddy", async () => {
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({ type: "buddy_done" }),
    );
    const { from } = await renderWith(<Taps />);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(showTab).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("notifications");
  });

  it("just opens the app for a type it doesn't know", async () => {
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({ type: "something_new", buddy_id: "user-2" }),
    );
    await renderWith(<Taps />);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(showTab).not.toHaveBeenCalled();
  });

  it("leaves a user with no group where they are, even for a buddy event", async () => {
    setGates({ hasNoGroup: true });
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({ type: "member_joined", buddy_id: "user-2" }),
    );
    await renderWith(<Taps />);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(showTab).not.toHaveBeenCalled();
  });
});

describe("useNotificationTaps, cheers", () => {
  let cheer: jest.Mock;
  let offCheer: () => void;
  beforeEach(() => {
    // A cheer from an earlier test's buddy tap, made with nobody listening,
    // is still held for the first listener; take it before the real one.
    onCheerRequest(() => {})();
    cheer = jest.fn();
    offCheer = onCheerRequest(cheer);
  });
  afterEach(() => offCheer());

  it("opens a habit cheer on the buddy's tab for a push about one habit", async () => {
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({
        type: "buddy_ticked",
        buddy_id: "user-2",
        goal_id: "goal-1",
        goal_title: "Run",
        day: "2026-10-16",
      }),
    );
    await renderWith(<Taps />);

    expect(showTab).toHaveBeenCalledWith("user-2");
    expect(cheer).toHaveBeenCalledTimes(1);
    expect(cheer).toHaveBeenCalledWith({
      buddyId: "user-2",
      goal: { id: "goal-1", title: "Run" },
      day: "2026-10-16",
    });
  });

  it("opens a day cheer for a closed-day push", async () => {
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({ type: "buddy_done", buddy_id: "user-2", day: "2026-10-16" }),
    );
    await renderWith(<Taps />);

    expect(showTab).toHaveBeenCalledWith("user-2");
    expect(cheer).toHaveBeenCalledWith({
      buddyId: "user-2",
      goal: null,
      day: "2026-10-16",
    });
  });

  it("offers no cheer for someone joining, only their tab", async () => {
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({ type: "member_joined", buddy_id: "user-2" }),
    );
    await renderWith(<Taps />);

    expect(showTab).toHaveBeenCalledWith("user-2");
    expect(cheer).not.toHaveBeenCalled();
  });

  it("opens your own tab for a cheer you received, like a nudge", async () => {
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({ type: "cheer", kind: "habit", sender_id: "user-2" }),
    );
    await renderWith(<Taps />);

    expect(router.navigate).toHaveBeenCalledWith("/");
    expect(showTab).toHaveBeenCalledWith(null);
    expect(cheer).not.toHaveBeenCalled();
  });

  it("opens no cheer for a user with no group", async () => {
    setGates({ hasNoGroup: true });
    push.getLastNotificationTap.mockReturnValue(
      nudgeTap({ type: "buddy_done", buddy_id: "user-2" }),
    );
    await renderWith(<Taps />);

    expect(cheer).not.toHaveBeenCalled();
  });

  it("opens the cheer once, however often the hook mounts again", async () => {
    const tap = nudgeTap({ type: "buddy_done", buddy_id: "user-2" });
    push.getLastNotificationTap.mockReturnValue(tap);
    await (await await renderWith(<Taps />)).unmount();
    await renderWith(<Taps />);

    expect(cheer).toHaveBeenCalledTimes(1);
  });
});

describe("useForgetTapsWhileSignedOut", () => {
  it("forgets a tap that opened the app signed out, even after signing in", async () => {
    const tap = nudgeTap();
    push.getLastNotificationTap.mockReturnValue(tap);
    const view = await renderWith(<SignedOutGuard signedIn={false} />, {
      signedIn: false,
    });
    expect(push.clearLastNotificationTap).toHaveBeenCalled();

    await view.rerenderWith(true, <SignedOutGuard signedIn />);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(showTab).not.toHaveBeenCalled();
  });

  it("forgets a tap made while signed out with the app running", async () => {
    const view = await renderWith(<SignedOutGuard signedIn={false} />, {
      signedIn: false,
    });
    const tap = nudgeTap();
    await liveTap(tap);
    push.getLastNotificationTap.mockReturnValue(tap);

    await view.rerenderWith(true, <SignedOutGuard signedIn />);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("leaves the tap alone until the stored session has been read", async () => {
    push.getLastNotificationTap.mockReturnValue(nudgeTap());
    const view = await renderWith(<SignedOutGuard signedIn={false} />, {
      signedIn: false,
      isLoaded: false,
    });
    expect(push.clearLastNotificationTap).not.toHaveBeenCalled();

    // The stored session turns out to be signed in: the tap is still routed.
    await view.rerenderWith(true, <SignedOutGuard signedIn />);
    expect(router.navigate).toHaveBeenCalledWith("/");
  });
});
