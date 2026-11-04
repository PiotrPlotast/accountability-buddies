import { Alert, Linking } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as ExpoCamera from "expo-camera";

import CameraModal from "@/app/components/dashboard/CameraModal";
import * as camera from "@/lib/camera";
import * as haptics from "@/lib/haptics";
import { Goal } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
} from "../test-utils/render";

const goal: Goal = {
  id: "g-1",
  title: "Run",
  user_id: "user-1",
  group_id: "group-1",
  completed_today: true,
  icon: "🏃",
  repeat_days: [],
};

async function renderCamera(isOnline = true) {
  const rpcImpl = jest.fn(() =>
    makeQueryBuilder({
      data: { success: true, photo_id: "p-1" },
      error: null,
    } as never),
  );
  const supabase = buildFakeSupabase({ rpcImpl });
  const { Wrapper } = buildWrapper({ supabase });
  const onClose = jest.fn();
  const utils = await render(
    <CameraModal
      goal={goal}
      day="2026-11-03"
      isOnline={isOnline}
      onClose={onClose}
    />,
    { wrapper: Wrapper },
  );
  return { ...utils, onClose, rpcImpl, supabase };
}

function permission(granted: boolean, canAskAgain: boolean) {
  const request = jest.fn(() => Promise.resolve({ granted, canAskAgain }));
  (ExpoCamera.useCameraPermissions as jest.Mock).mockReturnValue([
    { granted, canAskAgain, status: granted ? "granted" : "denied" },
    request,
  ]);
  return request;
}

describe("CameraModal", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(haptics, "tapLight").mockImplementation(() => {});
    jest.spyOn(haptics, "celebrate").mockImplementation(() => {});
    jest
      .spyOn(camera, "prepareForUpload")
      .mockResolvedValue(new ArrayBuffer(4));
    permission(true, true);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens on the back camera and flips to the front", async () => {
    const { getByTestId, getByLabelText, getByText } = await renderCamera();
    expect(getByText("Photo of Run")).toBeTruthy();
    expect(getByTestId("camera-view").props.facing).toBe("back");
    await fireEvent.press(getByLabelText("Flip camera"));
    expect(getByTestId("camera-view").props.facing).toBe("front");
  });

  it("takes a photo, previews it, and posts it", async () => {
    const { getByLabelText, onClose, rpcImpl } = await renderCamera();

    await act(async () => {
      await fireEvent.press(getByLabelText("Take photo"));
    });
    expect(haptics.tapLight).toHaveBeenCalled();
    expect(getByLabelText("Retake")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(getByLabelText("Post photo"));
    });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(camera.prepareForUpload).toHaveBeenCalledWith("file:///photo.jpg");
    expect(rpcImpl).toHaveBeenCalledWith(
      "attach_habit_photo",
      expect.objectContaining({ p_goal: "g-1", p_day: "2026-11-03" }),
    );
  });

  it("retakes before posting", async () => {
    const { getByLabelText, getByTestId } = await renderCamera();
    await act(async () => {
      await fireEvent.press(getByLabelText("Take photo"));
    });
    await fireEvent.press(getByLabelText("Retake"));
    expect(getByTestId("camera-view")).toBeTruthy();
  });

  it("can't post offline", async () => {
    const { getByLabelText, getByText, rpcImpl } = await renderCamera(false);
    await act(async () => {
      await fireEvent.press(getByLabelText("Take photo"));
    });
    const post = getByLabelText("Post photo");
    expect(post.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(getByText("Needs a connection")).toBeTruthy();
    await fireEvent.press(post);
    expect(rpcImpl).not.toHaveBeenCalled();
  });

  it("asks for the camera when it may", async () => {
    const request = permission(false, true);
    const { getByLabelText, queryByTestId } = await renderCamera();
    expect(queryByTestId("camera-view")).toBeNull();
    await act(async () => {
      await fireEvent.press(getByLabelText("Allow camera"));
    });
    expect(request).toHaveBeenCalled();
  });

  // iOS asks once per install; after a no, the way back is Settings.
  it("points to Settings once the camera has been refused", async () => {
    permission(false, false);
    const openSettings = jest
      .spyOn(Linking, "openSettings")
      .mockResolvedValue();
    const { getByLabelText } = await renderCamera();
    await fireEvent.press(getByLabelText("Open Settings"));
    expect(openSettings).toHaveBeenCalled();
  });

  it("cancels", async () => {
    const { getByLabelText, onClose } = await renderCamera();
    await fireEvent.press(getByLabelText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
