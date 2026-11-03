import { Alert } from "react-native";
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

function renderViewer(
  over: Partial<Parameters<typeof PhotoViewerModal>[0]> = {},
) {
  const handlers = {
    onClose: jest.fn(),
    onCheer: jest.fn(),
    onDelete: jest.fn(),
  };
  const utils = render(
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

  it("shows whose photo it is and of which habit", () => {
    const { getByText, getByLabelText } = renderViewer();
    expect(getByText("Ada")).toBeTruthy();
    expect(getByText(/Run/)).toBeTruthy();
    expect(getByLabelText("Ada's photo of Run")).toBeTruthy();
  });

  it("cheers a buddy's photo", () => {
    const { getByLabelText, onCheer } = renderViewer();
    fireEvent.press(getByLabelText("Cheer Ada"));
    expect(onCheer).toHaveBeenCalledWith(ada);
  });

  it("can't cheer offline", () => {
    const { getByLabelText, getByText, onCheer } = renderViewer({
      isOnline: false,
    });
    fireEvent.press(getByLabelText("Cheer Ada"));
    expect(onCheer).not.toHaveBeenCalled();
    expect(getByText("Needs a connection")).toBeTruthy();
  });

  it("moves between the day's photos", () => {
    const { getByLabelText, getByText } = renderViewer();
    expect(getByLabelText("Previous photo").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    fireEvent.press(getByLabelText("Next photo"));
    expect(getByText("You")).toBeTruthy();
    expect(getByLabelText("Next photo").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it("deletes your own photo after asking, and never offers a cheer for it", () => {
    const { getByLabelText, queryByLabelText, onDelete } = renderViewer({
      initialIndex: 1,
    });

    expect(queryByLabelText(/^Cheer/)).toBeNull();
    fireEvent.press(getByLabelText("Delete photo"));
    expect(onDelete).not.toHaveBeenCalled();

    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe("Delete this photo?");
    expect(message).toBe("You can't post another photo of Read today.");
    buttons.find((b: { text: string }) => b.text === "Delete").onPress();
    expect(onDelete).toHaveBeenCalledWith(mine);
  });

  it("closes", () => {
    const { getByLabelText, onClose } = renderViewer();
    fireEvent.press(getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
