import { useRef, useState } from "react";
import { Image, Linking, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAddHabitPhoto } from "@/hooks/useAddHabitPhoto";
import { useTheme } from "@/hooks/useTheme";
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
} from "@/lib/camera";
import { tapLight } from "@/lib/haptics";
import { Goal } from "@/types/dashboardTypes";
import NeedsConnection from "@/app/components/ui/NeedsConnection";

type Props = {
  goal: Goal;
  // The day the habit was ticked, read when the camera opened.
  day: string;
  isOnline: boolean;
  onClose: () => void;
};

/**
 * A live photo of a ticked habit: the in-app camera only, no gallery, so a
 * photo is of now. Opens on the back camera with a flip button. A shot can be
 * retaken until it is posted; once posted it is final. Remounted with a `key`
 * per opening, so nothing from a previous shot survives.
 */
export default function CameraModal({ goal, day, isOnline, onClose }: Props) {
  const { accent } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const [shot, setShot] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);
  const { mutate, isPending } = useAddHabitPhoto();

  const takePhoto = async () => {
    if (taking || !camera.current) return;
    setTaking(true);
    tapLight();
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.8 });
      if (picture?.uri) setShot(picture.uri);
    } finally {
      setTaking(false);
    }
  };

  const post = () => {
    if (!shot || !isOnline || isPending) return;
    mutate(
      { goalId: goal.id, groupId: goal.group_id, day, uri: shot },
      { onSuccess: onClose },
    );
  };

  const textButton = (
    label: string,
    text: string,
    onPress: () => void,
    opts: { primary?: boolean; disabled?: boolean } = {},
  ) => (
    <Pressable
      onPress={onPress}
      disabled={opts.disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!opts.disabled }}
      style={{
        backgroundColor: opts.primary ? accent.hex : undefined,
        borderColor: opts.primary ? accent.hex : undefined,
        opacity: opts.disabled ? 0.4 : 1,
      }}
      className="h-12 px-6 rounded-tile border border-border items-center justify-center"
    >
      <Text
        className={`font-mono-medium ${opts.primary ? "text-bg" : "text-text"}`}
      >
        {text}
      </Text>
    </Pressable>
  );

  let body;
  if (!permission) {
    body = <View className="flex-1" />;
  } else if (!permission.granted) {
    body = (
      <View className="flex-1 items-center justify-center px-8 gap-4">
        <Text className="text-text text-center text-base">
          {permission.canAskAgain
            ? `Allow camera access to take a photo of ${goal.title}.`
            : "Camera access is off for this app. Turn it on in Settings to post a photo."}
        </Text>
        {permission.canAskAgain
          ? textButton("Allow camera", "Allow camera", requestPermission, {
              primary: true,
            })
          : textButton(
              "Open Settings",
              "Open Settings",
              () => void Linking.openSettings(),
              { primary: true },
            )}
      </View>
    );
  } else if (shot) {
    body = (
      <>
        <View className="flex-1 mx-5">
          <Image
            source={{ uri: shot }}
            style={{ flex: 1, borderRadius: 18 }}
            resizeMode="cover"
            accessibilityLabel={`Your photo of ${goal.title}`}
          />
        </View>
        <View className="px-5 mt-4">
          <View className="flex-row justify-center gap-3">
            {textButton("Retake", "Retake", () => setShot(null), {
              disabled: isPending,
            })}
            {textButton("Post photo", isPending ? "Posting…" : "Post", post, {
              primary: true,
              disabled: !isOnline || isPending,
            })}
          </View>
          {isOnline ? null : <NeedsConnection />}
        </View>
      </>
    );
  } else {
    body = (
      <>
        <View
          className="flex-1 mx-5"
          style={{ borderRadius: 18, overflow: "hidden" }}
        >
          <CameraView ref={camera} style={{ flex: 1 }} facing={facing} />
        </View>
        <View className="flex-row items-center justify-between px-8 mt-4">
          <Pressable
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            className="w-12 h-12 items-center justify-center"
          >
            <Text style={{ fontSize: 24 }}>🔄</Text>
          </Pressable>
          <Pressable
            onPress={takePhoto}
            disabled={taking}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            style={{ borderColor: accent.hex }}
            className="w-20 h-20 rounded-full border-4 items-center justify-center"
          >
            <View
              style={{ backgroundColor: accent.hex }}
              className="w-14 h-14 rounded-full"
            />
          </Pressable>
          <View className="w-12 h-12" />
        </View>
      </>
    );
  }

  return (
    <Modal
      visible
      animationType="slide"
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
          <Text
            accessibilityRole="header"
            className="flex-1 text-text text-lg font-semibold"
          >
            Photo of {goal.title}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            className="px-2 py-2"
          >
            <Text style={{ color: accent.hex }} className="font-mono-medium">
              Cancel
            </Text>
          </Pressable>
        </View>
        {body}
      </View>
    </Modal>
  );
}
