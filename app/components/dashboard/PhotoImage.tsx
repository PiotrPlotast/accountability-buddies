import { Image, type ImageContentFit } from "expo-image";
import type { StyleProp, ImageStyle } from "react-native";

import { themeColors } from "@/lib/colors";

type Props = {
  path: string;
  // The signed URL; undefined while it is being signed, which shows the
  // empty tile rather than nothing.
  url: string | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
};

/**
 * A habit photo. Cached by its storage path, not its URL: the URL is signed
 * again every hour, and keyed by URL every re-sign would download the same
 * picture again.
 */
export default function PhotoImage({
  path,
  url,
  style,
  contentFit = "cover",
}: Props) {
  return (
    <Image
      source={url ? { uri: url, cacheKey: path } : undefined}
      style={[{ backgroundColor: themeColors.surface }, style]}
      contentFit={contentFit}
      transition={150}
      accessibilityIgnoresInvertColors
    />
  );
}
