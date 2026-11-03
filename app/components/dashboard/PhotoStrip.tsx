import { Pressable, ScrollView, Text, View } from "react-native";

import { firstName } from "@/lib/nudge";
import type { PhotoItem } from "@/lib/habitPhotos";
import PhotoImage from "./PhotoImage";

type Props = {
  items: PhotoItem[];
  urls: Record<string, string>;
  onOpen: (index: number) => void;
  // To say "Your photo" rather than your own name.
  userId?: string;
};

export function photoLabel(item: PhotoItem, userId?: string): string {
  const who =
    item.member.userId === userId ? "Your" : `${firstName(item.member.name)}'s`;
  return `${who} photo of ${item.goal.title}`;
}

/**
 * Today's photos from the whole group, newest first, above the member tabs.
 * Nothing at all on a day nobody has posted, so the dashboard looks as it
 * always did.
 */
export default function PhotoStrip({ items, urls, onOpen, userId }: Props) {
  if (items.length === 0) return null;

  return (
    <View className="mt-3">
      <Text
        accessibilityRole="header"
        className="px-5 mb-2 text-text-muted font-mono text-xs uppercase tracking-widest"
      >
        Today&apos;s photos
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      >
        {items.map((item, index) => (
          <Pressable
            key={item.photo.id}
            onPress={() => onOpen(index)}
            accessibilityRole="button"
            accessibilityLabel={photoLabel(item, userId)}
            className="items-center"
          >
            <PhotoImage
              path={item.photo.path}
              url={urls[item.photo.path]}
              style={{ width: 64, height: 64, borderRadius: 14 }}
            />
            <Text
              numberOfLines={1}
              style={{ maxWidth: 64 }}
              className="mt-1 text-text-muted font-mono text-xs"
            >
              {item.member.userId === userId
                ? "You"
                : firstName(item.member.name)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
