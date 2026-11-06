import { Alert, Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import PhotoViewerModal from "@/app/components/dashboard/PhotoViewerModal";
import { PhotoItem } from "@/lib/habitPhotos";

const item = (
  id: string,
  userId: string,
  name: string,
  title: string,
): PhotoItem => ({
  photo: {
    id,
    path: `${id}.jpg`,
    createdAt: "2026-11-03T08:05:00Z",
    removed: false,
  },
  goal: {
    id: `g-${id}`,
    title,
    user_id: userId,
    group_id: "group-1",
    completed_today: true,
    icon: "🏃",
    repeat_days: [],
  },
  member: { userId, name },
});

const ada = item("p-1", "user-2", "Ada Lovelace", "Run");
const mine = item("p-2", "user-1", "Me Myself", "Read");

async function renderViewer(
  over: Partial<Parameters<typeof PhotoViewerModal>[0]> = {},
) {
  const handlers = {
    onClose: jest.fn(),
    onCheer: jest.fn(),
    onDelete: jest.fn(),
  };
  const utils = await render(
    <PhotoViewerModal
      items={[ada, mine]}
      initialIndex={0}
      urls={{ "p-1.jpg": "signed:p-1", "p-2.jpg": "signed:p-2" }}
      userId="user-1"
      isOnline
      {...handlers}
      {...over}
    />,
  );
  return { ...utils, ...handlers };
}

describe("PhotoViewerModal", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows whose photo it is and of which habit", async () => {
    const { getByText, getByLabelText } = await renderViewer();
    expect(getByText("Ada")).toBeTruthy();
    expect(getByText(/Run/)).toBeTruthy();
    expect(getByLabelText("Ada's photo of Run")).toBeTruthy();
  });

  it("cheers a buddy's photo", async () => {
    const { getByLabelText, onCheer } = await renderViewer();
    await fireEvent.press(getByLabelText("Cheer Ada"));
    expect(onCheer).toHaveBeenCalledWith(ada);
  });

  it("can't cheer offline", async () => {
    const { getByLabelText, getByText, onCheer } = await renderViewer({
      isOnline: false,
    });
    await fireEvent.press(getByLabelText("Cheer Ada"));
    expect(onCheer).not.toHaveBeenCalled();
    expect(getByText("Needs a connection")).toBeTruthy();
  });

  it("moves between the day's photos", async () => {
    const { getByLabelText, getByText } = await renderViewer();
    expect(getByLabelText("Previous photo").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    await fireEvent.press(getByLabelText("Next photo"));
    expect(getByText("You")).toBeTruthy();
    expect(getByLabelText("Next photo").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it("deletes your own photo after asking, and never offers a cheer for it", async () => {
    const { getByLabelText, queryByLabelText, onDelete } = await renderViewer({
      initialIndex: 1,
    });

    expect(queryByLabelText(/^Cheer/)).toBeNull();
    await fireEvent.press(getByLabelText("Delete photo"));
    expect(onDelete).not.toHaveBeenCalled();

    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe("Delete this photo?");
    expect(message).toBe("You can't post another photo of Read today.");
    buttons.find((b: { text: string }) => b.text === "Delete").onPress();
    expect(onDelete).toHaveBeenCalledWith(mine);
  });

  it("closes", async () => {
    const { getByLabelText, onClose } = await renderViewer();
    await fireEvent.press(getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  // The cheer opened from a photo is drawn inside the viewer; the last photo
  // going (unticked away) must not take a half-written cheer with it.
  it("keeps what it was given to draw when the last photo goes", async () => {
    const { getByText } = await renderViewer({
      items: [],
      children: <Text>Cheer box</Text>,
    });
    expect(getByText("Cheer box")).toBeTruthy();
  });
});
