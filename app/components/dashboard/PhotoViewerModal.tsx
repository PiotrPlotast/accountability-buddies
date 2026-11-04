import { useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/useTheme";
import { firstName } from "@/lib/nudge";
import type { PhotoItem } from "@/lib/habitPhotos";
import NeedsConnection from "@/app/components/ui/NeedsConnection";
import PhotoImage from "./PhotoImage";
import { photoLabel } from "./PhotoStrip";

type Props = {
  items: PhotoItem[];
  initialIndex: number;
  urls: Record<string, string>;
  userId: string;
  isOnline: boolean;
  onClose: () => void;
  // A buddy's photo: a cheer for that habit.
  onCheer: (item: PhotoItem) => void;
  // Your own photo, once confirmed. Final: no other photo of it today.
  onDelete: (item: PhotoItem) => void;
};

/**
 * Today's photos, one at a time, full screen. Remounted with a `key` per
 * opening, so `initialIndex` is read once. Moves by Previous/Next rather than
 * a pager, like the tour, so every step is a button a screen reader can reach.
 */
export default function PhotoViewerModal({
  items,
  initialIndex,
  urls,
  userId,
  isOnline,
  onClose,
  onCheer,
  onDelete,
}: Props) {
  const { accent } = useTheme();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  if (items.length === 0) return null;
  // The list can shrink under the viewer (a photo deleted or unticked away).
  const at = Math.min(index, items.length - 1);
  const item = items[at];
  const mine = item.member.userId === userId;
  const name = mine ? "You" : firstName(item.member.name);
  const time = new Date(item.photo.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const confirmDelete = () =>
    Alert.alert(
      "Delete this photo?",
      `You can't post another photo of ${item.goal.title} today.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(item) },
      ],
    );

  const navButton = (
    label: string,
    glyph: string,
    disabled: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{ opacity: disabled ? 0.3 : 1 }}
      className="w-12 h-12 items-center justify-center"
    >
      <Text className="text-text text-3xl">{glyph}</Text>
    </Pressable>
  );

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-bg"
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 12,
        }}
      >
        <View className="flex-row items-center px-5 mb-3">
          <View className="flex-1">
            <Text
              accessibilityRole="header"
              className="text-text text-lg font-semibold"
            >
              {name}
            </Text>
            <Text className="text-text-muted font-mono text-xs mt-1">
              {item.goal.icon ? `${item.goal.icon} ` : ""}
              {item.goal.title} · {time}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="px-2 py-2"
          >
            <Text style={{ color: accent.hex }} className="font-mono-medium">
              Done
            </Text>
          </Pressable>
        </View>

        <View
          className="flex-1 mx-5"
          accessible
          accessibilityRole="image"
          accessibilityLabel={photoLabel(item, userId)}
        >
          <PhotoImage
            path={item.photo.path}
            url={urls[item.photo.path]}
            contentFit="contain"
            style={{ flex: 1, borderRadius: 18 }}
          />
        </View>

        <View className="flex-row items-center justify-between px-5 mt-4">
          {navButton("Previous photo", "‹", at === 0, () => setIndex(at - 1))}
          {mine ? (
            <Pressable
              onPress={confirmDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete photo"
              className="h-12 px-6 rounded-tile border border-border items-center justify-center"
            >
              <Text className="text-danger font-mono-medium">Delete photo</Text>
            </Pressable>
          ) : (
            <View className="items-center">
              <Pressable
                onPress={() => onCheer(item)}
                disabled={!isOnline}
                accessibilityRole="button"
                accessibilityLabel={`Cheer ${name}`}
                accessibilityState={{ disabled: !isOnline }}
                style={{ borderColor: accent.hex, opacity: isOnline ? 1 : 0.4 }}
                className="h-12 px-6 rounded-tile border flex-row items-center justify-center gap-2"
              >
                <Text style={{ fontSize: 16 }}>🎉</Text>
                <Text
                  style={{ color: accent.hex }}
                  className="font-mono-medium"
                >
                  Cheer
                </Text>
              </Pressable>
              {isOnline ? null : <NeedsConnection />}
            </View>
          )}
          {navButton("Next photo", "›", at >= items.length - 1, () =>
            setIndex(at + 1),
          )}
        </View>
      </View>
    </Modal>
  );
}
