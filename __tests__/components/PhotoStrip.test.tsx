import { fireEvent, render } from "@testing-library/react-native";

import PhotoStrip from "@/app/components/dashboard/PhotoStrip";
import { PhotoItem } from "@/lib/habitPhotos";

const item = (id: string, name: string, title: string): PhotoItem => ({
  photo: {
    id,
    path: `${id}.jpg`,
    createdAt: "2026-11-03T08:00:00Z",
    removed: false,
  },
  goal: {
    id: `g-${id}`,
    title,
    user_id: name,
    group_id: "group-1",
    completed_today: true,
    icon: null,
    repeat_days: [],
  },
  member: { userId: name, name },
});

describe("PhotoStrip", () => {
  it("renders nothing when nobody has posted today", () => {
    const { toJSON } = render(
      <PhotoStrip items={[]} urls={{}} onOpen={jest.fn()} />,
    );
    expect(toJSON()).toBeNull();
  });

  it("shows each photo, named for its poster and habit, and opens the one tapped", () => {
    const onOpen = jest.fn();
    const { getByLabelText, getByText } = render(
      <PhotoStrip
        items={[item("p-1", "Ada Lovelace", "Run"), item("p-2", "Bo", "Read")]}
        urls={{ "p-1.jpg": "signed:p-1" }}
        onOpen={onOpen}
      />,
    );

    expect(getByText("Today's photos")).toBeTruthy();
    fireEvent.press(getByLabelText("Bo's photo of Read"));
    expect(onOpen).toHaveBeenCalledWith(1);
    expect(getByLabelText("Ada's photo of Run")).toBeTruthy();
  });
});
