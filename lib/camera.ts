// The only importer of `expo-camera`, `expo-image-manipulator` and
// `expo-file-system`, the way `lib/haptics.ts` is the only importer of
// `expo-haptics`: one place to mock, and one place that knows how a photo
// becomes something the `habit-photos` bucket takes (JPEG, 2 MB).

import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export { CameraView, useCameraPermissions } from "expo-camera";
export type { CameraType } from "expo-camera";

// About 150–400 KB of JPEG for a phone photo: comfortably under the bucket's
// 2 MB, and sharp on any phone screen.
export const PHOTO_MAX_WIDTH = 1080;
const PHOTO_QUALITY = 0.7;

/** The photo at `uri`, shrunk and re-encoded, as the bytes to upload. */
export async function prepareForUpload(uri: string): Promise<ArrayBuffer> {
  const image = await ImageManipulator.manipulate(uri)
    .resize({ width: PHOTO_MAX_WIDTH })
    .renderAsync();
  const saved = await image.saveAsync({
    compress: PHOTO_QUALITY,
    format: SaveFormat.JPEG,
  });
  return new File(saved.uri).arrayBuffer();
}
