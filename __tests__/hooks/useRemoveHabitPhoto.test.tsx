import { act } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useRemoveHabitPhoto } from "@/hooks/useRemoveHabitPhoto";
import { getTodayLocalDate } from "@/lib/date";
import * as haptics from "@/lib/haptics";
import { queryKeys } from "@/lib/queryKeys";
import { Member } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
  renderHookWithSession,
} from "../test-utils/render";

const members: Member[] = [
  {
    user_id: "user-1",
    full_name: "Me",
    goals: [
      {
        id: "g-1",
        title: "Run",
        user_id: "user-1",
        group_id: "group-1",
        completed_today: true,
        icon: null,
        repeat_days: [],
        photo: { id: "p-1", path: "a.jpg", createdAt: "x", removed: false },
      },
    ],
  },
];

async function renderRemove(rpcImpl: jest.Mock) {
  const queryClient = makeQueryClient();
  const key = queryKeys.groupMembers("group-1", getTodayLocalDate());
  queryClient.setQueryData(key, members);
  const { Wrapper } = buildWrapper({
    supabase: buildFakeSupabase({ rpcImpl }),
    queryClient,
  });
  const utils = await renderHookWithSession(
    () => useRemoveHabitPhoto(),
    Wrapper,
  );
  const photo = () =>
    queryClient.getQueryData<Member[]>(key)?.[0].goals[0].photo;
  return { utils, photo };
}

describe("useRemoveHabitPhoto", () => {
  let errorHaptic: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    errorHaptic = jest.spyOn(haptics, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("removes the photo on the server and marks it removed in the cache", async () => {
    const rpcImpl = jest.fn(() =>
      makeQueryBuilder({
        data: { success: true, message: "Photo deleted." },
        error: null,
      } as never),
    );
    const { utils, photo } = await renderRemove(rpcImpl);

    await act(async () => {
      await utils.result.current.value.mutateAsync({
        photoId: "p-1",
        groupId: "group-1",
      });
    });

    expect(rpcImpl).toHaveBeenCalledWith("remove_habit_photo", { p_id: "p-1" });
    // Removed, not gone: the day's photo stays used.
    expect(photo()).toEqual(
      expect.objectContaining({ id: "p-1", removed: true }),
    );
  });

  it("keeps the photo and explains when the server refuses", async () => {
    const rpcImpl = jest.fn(() =>
      makeQueryBuilder({
        data: { success: false, message: "That photo isn't yours." },
        error: null,
      } as never),
    );
    const { utils, photo } = await renderRemove(rpcImpl);

    await act(async () => {
      await utils.result.current.value
        .mutateAsync({ photoId: "p-1", groupId: "group-1" })
        .catch(() => {});
    });

    expect(photo()).toEqual(expect.objectContaining({ removed: false }));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Photo not deleted",
      "That photo isn't yours.",
    );
    expect(errorHaptic).toHaveBeenCalledTimes(1);
  });
});
