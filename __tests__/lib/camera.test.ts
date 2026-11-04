import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";

import { PHOTO_MAX_WIDTH, prepareForUpload } from "@/lib/camera";

describe("prepareForUpload", () => {
  // A phone photo is several megabytes; the bucket takes 2 MB of JPEG.
  it("shrinks the photo to 1080 px wide JPEG and reads it as bytes", async () => {
    const bytes = await prepareForUpload("file:///photo.jpg");

    expect(PHOTO_MAX_WIDTH).toBe(1080);
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith(
      "file:///photo.jpg",
    );
    const context = (ImageManipulator.manipulate as jest.Mock).mock.results[0]
      .value;
    expect(context.resize).toHaveBeenCalledWith({ width: 1080 });
    const image = await context.renderAsync.mock.results[0].value;
    expect(image.saveAsync).toHaveBeenCalledWith({
      compress: 0.7,
      format: SaveFormat.JPEG,
    });
    expect(File).toHaveBeenCalledWith("file:///compressed.jpg");
    expect(bytes).toBeInstanceOf(ArrayBuffer);
  });
});
