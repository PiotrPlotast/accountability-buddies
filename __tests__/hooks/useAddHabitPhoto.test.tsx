import { act } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useAddHabitPhoto } from "@/hooks/useAddHabitPhoto";
import * as camera from "@/lib/camera";
import * as haptics from "@/lib/haptics";
import { queryKeys } from "@/lib/queryKeys";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  renderHookWithSession,
} from "../test-utils/render";

// `randomUUID` is mocked in jest.setup.js.
const PATH = "user-1/g-1/2026-11-03/00000000-0000-4000-8000-000000000000.jpg";

const vars = {
  goalId: "g-1",
  groupId: "group-1",
  day: "2026-11-03",
  uri: "file:///photo.jpg",
};

function attachAnswer(data: unknown, error: unknown = null) {
  return jest.fn(() => makeQueryBuilder({ data, error } as never));
}

async function renderAdd(opts: Parameters<typeof buildFakeSupabase>[0] = {}) {
  const supabase = buildFakeSupabase(opts);
  const { Wrapper, queryClient } = buildWrapper({ supabase });
  const invalidate = jest.spyOn(queryClient, "invalidateQueries");
  const utils = await renderHookWithSession(() => useAddHabitPhoto(), Wrapper);
  const bucket = () =>
    (supabase.storage.from as jest.Mock).mock.results[0]?.value;
  return { utils, supabase, bucket, invalidate };
}

describe("useAddHabitPhoto", () => {
  let celebrate: jest.SpyInstance;
  let errorHaptic: jest.SpyInstance;
  let prepare: jest.SpyInstance;
  const bytes = new ArrayBuffer(4);

  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    celebrate = jest.spyOn(haptics, "celebrate").mockImplementation(() => {});
    errorHaptic = jest.spyOn(haptics, "error").mockImplementation(() => {});
    prepare = jest.spyOn(camera, "prepareForUpload").mockResolvedValue(bytes);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uploads the compressed photo to the habit's folder, then attaches it", async () => {
    const rpcImpl = attachAnswer({
      success: true,
      message: "Photo posted.",
      photo_id: "p-1",
    });
    const { utils, supabase, bucket, invalidate } = await renderAdd({
      rpcImpl,
    });

    await act(async () => {
      await utils.result.current.value.mutateAsync(vars);
    });

    expect(prepare).toHaveBeenCalledWith("file:///photo.jpg");
    expect(supabase.storage.from).toHaveBeenCalledWith("habit-photos");
    expect(bucket().upload).toHaveBeenCalledWith(PATH, bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });
    expect(rpcImpl).toHaveBeenCalledWith("attach_habit_photo", {
      p_goal: "g-1",
      p_day: "2026-11-03",
      p_path: PATH,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.groupMembersOfGroup("group-1"),
    });
    expect(bucket().remove).not.toHaveBeenCalled();
  });

  // Like a nudge: the buzz waits for the server, which may still refuse.
  it("celebrates on the server's confirmation", async () => {
    const rpcImpl = attachAnswer({
      success: true,
      message: "Photo posted.",
      photo_id: "p-1",
    });
    const { utils } = await renderAdd({ rpcImpl });

    await act(async () => {
      await utils.result.current.value.mutateAsync(vars);
    });

    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(errorHaptic).not.toHaveBeenCalled();
  });

  it("takes the upload back and shows the server's reason when attaching is refused", async () => {
    const rpcImpl = attachAnswer({
      success: false,
      message: "You've already posted a photo for this habit today.",
    });
    const { utils, bucket } = await renderAdd({ rpcImpl });

    await act(async () => {
      await utils.result.current.value.mutateAsync(vars).catch(() => {});
    });

    expect(bucket().remove).toHaveBeenCalledWith([PATH]);
    expect(Alert.alert).toHaveBeenCalledWith(
      "Photo not posted",
      "You've already posted a photo for this habit today.",
    );
    expect(errorHaptic).toHaveBeenCalledTimes(1);
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("takes the upload back when the attach request fails", async () => {
    const rpcImpl = attachAnswer(null, { message: "Network request failed" });
    const { utils, bucket } = await renderAdd({ rpcImpl });

    await act(async () => {
      await utils.result.current.value.mutateAsync(vars).catch(() => {});
    });

    expect(bucket().remove).toHaveBeenCalledWith([PATH]);
    expect(Alert.alert).toHaveBeenCalledWith(
      "Photo not posted",
      "Check your connection and try again.",
    );
  });

  it("attaches nothing when the upload fails", async () => {
    const rpcImpl = attachAnswer({ success: true, photo_id: "p-1" });
    const upload = jest.fn(() =>
      Promise.resolve({ data: null, error: { message: "Payload too large" } }),
    );
    const { utils } = await renderAdd({ rpcImpl, storage: { upload } });

    await act(async () => {
      await utils.result.current.value.mutateAsync(vars).catch(() => {});
    });

    expect(rpcImpl).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Photo not posted",
      "Payload too large",
    );
  });
});
