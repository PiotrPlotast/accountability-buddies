import { act, waitFor } from "@testing-library/react-native";
import {
  dehydrate,
  hydrate,
  onlineManager,
  QueryClient,
} from "@tanstack/react-query";
import { Alert } from "react-native";

import { useAddGoal } from "@/hooks/useAddGoal";
import { useDeleteGoal } from "@/hooks/useDeleteGoal";
import { usePendingGoalChanges } from "@/hooks/usePendingGoalChanges";
import { useToggleGoal } from "@/hooks/useToggleGoal";
import { getTodayLocalDate } from "@/lib/date";
import { registerGoalMutationDefaults } from "@/lib/goalMutationDefaults";
import { queryKeys } from "@/lib/queryKeys";
import { SYNC_ALERT_DELAY_MS } from "@/lib/syncFailures";
import { Goal, Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
  renderHookWithSession,
} from "../test-utils/render";

const run: Goal = {
  id: "g-1",
  title: "Run",
  user_id: "user-1",
  group_id: "group-1",
  completed_today: false,
  completed_dates: [],
  icon: null,
  repeat_days: [0, 1, 2, 3, 4, 5, 6],
};

function seeded() {
  const queryClient = makeQueryClient();
  queryClient.setQueryData<Member[]>(
    queryKeys.groupMembers("group-1", getTodayLocalDate()),
    [{ user_id: "user-1", full_name: "Me", goals: [{ ...run }] }],
  );
  return queryClient;
}

function myGoals(queryClient: QueryClient) {
  return queryClient
    .getQueryData<Member[]>(
      queryKeys.groupMembers("group-1", getTodayLocalDate()),
    )
    ?.find((m) => m.user_id === "user-1")?.goals;
}

/** Every call to `from` recorded as [table, method, payload]. */
function recordingSupabase(
  result: { error: unknown; data?: unknown } = { error: null },
) {
  const calls: [string, string, unknown][] = [];
  const fromImpl = jest.fn((table: string) => {
    const qb = makeQueryBuilder(result as never);
    for (const method of ["insert", "update", "delete"]) {
      const original = qb[method];
      qb[method] = jest.fn((payload?: unknown) => {
        calls.push([table, method, payload]);
        return original(payload);
      });
    }
    return qb;
  });
  return { supabase: buildFakeSupabase({ fromImpl }), fromImpl, calls };
}

async function goOnline(queryClient: QueryClient) {
  await act(async () => {
    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();
  });
}

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

describe("goal changes made offline", () => {
  it("ticks on screen at once and sends nothing until the connection returns", async () => {
    const { supabase, fromImpl, calls } = recordingSupabase();
    const queryClient = seeded();
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);
    onlineManager.setOnline(false);

    await act(async () => {
      utils.result.current.value.mutate({ ...run });
    });

    await waitFor(() =>
      expect(myGoals(queryClient)?.[0].completed_today).toBe(true),
    );
    expect(fromImpl).not.toHaveBeenCalled();

    await goOnline(queryClient);

    await waitFor(() =>
      expect(calls).toEqual([
        ["logs", "insert", expect.objectContaining({ goal_id: "g-1" })],
      ]),
    );
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  // The modals await their save before closing. Offline that promise would
  // hang until the connection returned, so a queued change counts as done.
  it("resolves the caller's await as soon as the change is queued", async () => {
    const { supabase } = recordingSupabase();
    const { Wrapper } = buildWrapper({ supabase, queryClient: seeded() });
    const utils = await renderHookWithSession(() => useDeleteGoal(), Wrapper);
    onlineManager.setOnline(false);

    let settled = false;
    await act(async () => {
      await utils.result.current.value
        .mutateAsync({ goalId: "g-1", groupId: "group-1" })
        .then(() => (settled = true));
    });

    expect(settled).toBe(true);
  });

  it("writes the day the habit was ticked, not the day it synced", async () => {
    jest.useFakeTimers({
      now: new Date(2026, 9, 5, 23, 59),
      doNotFake: ["nextTick", "setImmediate"],
    });
    try {
      const { supabase, calls } = recordingSupabase();
      const queryClient = makeQueryClient();
      queryClient.setQueryData<Member[]>(
        queryKeys.groupMembers("group-1", "2026-10-05"),
        [{ user_id: "user-1", full_name: "Me", goals: [{ ...run }] }],
      );
      const { Wrapper } = buildWrapper({ supabase, queryClient });
      const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);
      onlineManager.setOnline(false);
      await act(async () => {
        utils.result.current.value.mutate({ ...run });
      });

      jest.setSystemTime(new Date(2026, 9, 6, 8, 0));
      await goOnline(queryClient);

      await waitFor(() =>
        expect(calls[0]).toEqual([
          "logs",
          "insert",
          expect.objectContaining({ date: "2026-10-05" }),
        ]),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  // A habit created offline gets its id on the phone, so a tick queued behind
  // it points at the row the create will make.
  it("creates a habit with a phone-made id and syncs a tick on it in order", async () => {
    const { supabase, calls } = recordingSupabase({ error: null, data: null });
    const queryClient = seeded();
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = await renderHookWithSession(
      () => ({ add: useAddGoal(), toggle: useToggleGoal() }),
      Wrapper,
    );
    onlineManager.setOnline(false);

    await act(async () => {
      utils.result.current.value.add.mutate({
        title: "Read",
        groupId: "group-1",
      });
    });
    const created = myGoals(queryClient)?.find((g) => g.title === "Read");
    expect(created?.id).toBe("00000000-0000-4000-8000-000000000000");

    await act(async () => {
      utils.result.current.value.toggle.mutate({ ...created! });
    });

    await goOnline(queryClient);

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toEqual([
      "goals",
      "insert",
      expect.objectContaining({ id: created!.id, title: "Read" }),
    ]);
    expect(calls[1]).toEqual([
      "logs",
      "insert",
      expect.objectContaining({ goal_id: created!.id }),
    ]);
  });

  it("counts the changes still waiting to sync", async () => {
    const { supabase } = recordingSupabase();
    const queryClient = seeded();
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = await renderHookWithSession(
      () => ({ toggle: useToggleGoal(), pending: usePendingGoalChanges() }),
      Wrapper,
    );
    expect(utils.result.current.value.pending).toBe(0);
    onlineManager.setOnline(false);

    await act(async () => {
      utils.result.current.value.toggle.mutate({ ...run });
      utils.result.current.value.toggle.mutate({
        ...run,
        completed_today: true,
      });
    });
    await waitFor(() => expect(utils.result.current.value.pending).toBe(2));

    await goOnline(queryClient);
    await waitFor(() => expect(utils.result.current.value.pending).toBe(0));
  });

  // Closing the app offline must not lose the queue: the persister saves
  // paused mutations, and the restored ones need their functions back.
  it("sends a change queued before the app was closed", async () => {
    const before = seeded();
    const { Wrapper } = buildWrapper({
      supabase: recordingSupabase().supabase,
      queryClient: before,
    });
    const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);
    onlineManager.setOnline(false);
    await act(async () => {
      utils.result.current.value.mutate({ ...run });
    });
    const saved = JSON.parse(JSON.stringify(dehydrate(before)));
    expect(saved.mutations).toHaveLength(1);

    const after = makeQueryClient();
    const { supabase, calls } = recordingSupabase();
    registerGoalMutationDefaults(after, () => supabase);
    hydrate(after, saved);

    await goOnline(after);

    await waitFor(() =>
      expect(calls).toEqual([
        [
          "logs",
          "insert",
          expect.objectContaining({ goal_id: "g-1", user_id: "user-1" }),
        ],
      ]),
    );
  });
});

describe("a queued change the server refuses", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("is undone and reported once, together with the others", async () => {
    const { supabase } = recordingSupabase({
      error: {
        message: "new row violates row-level security policy",
        code: "42501",
      },
    });
    const queryClient = seeded();
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = await renderHookWithSession(() => useToggleGoal(), Wrapper);
    onlineManager.setOnline(false);
    await act(async () => {
      utils.result.current.value.mutate({ ...run });
      utils.result.current.value.mutate({ ...run, completed_today: true });
    });

    await goOnline(queryClient);
    // Nothing yet: one pop-up for the whole sync, not one per change.
    expect(Alert.alert).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(SYNC_ALERT_DELAY_MS);
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe("2 changes couldn't be saved");
    expect(body).toContain('Ticking "Run"');
    expect(body).toContain('Unticking "Run"');
    // Undone by reading the truth back, not by replaying a snapshot taken
    // before the other queued changes.
    expect(
      queryClient.getQueryState(
        queryKeys.groupMembers("group-1", getTodayLocalDate()),
      )?.isInvalidated,
    ).toBe(true);
  });

  it("says one change in the singular", async () => {
    const { supabase } = recordingSupabase({
      error: { message: "Goal not found", code: "P0001" },
    });
    const queryClient = seeded();
    const { Wrapper } = buildWrapper({ supabase, queryClient });
    const utils = await renderHookWithSession(() => useDeleteGoal(), Wrapper);
    onlineManager.setOnline(false);
    await act(async () => {
      utils.result.current.value.mutate({
        goalId: "g-1",
        groupId: "group-1",
        title: "Run",
      });
    });

    await goOnline(queryClient);
    await act(async () => {
      jest.advanceTimersByTime(SYNC_ALERT_DELAY_MS);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "1 change couldn't be saved",
      expect.stringContaining('Deleting "Run": Goal not found'),
    );
  });
});
