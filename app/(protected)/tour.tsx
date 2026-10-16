import "../../global.css";
import { useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { useCompleteTour } from "@/hooks/useTour";
import { themeColors } from "@/lib/colors";
import { TOUR_SLIDES } from "@/lib/tour";

/**
 * The first-run walkthrough, and its replay from settings.
 *
 * On first run `(protected)/_layout.tsx` mounts nothing else (the tour gate),
 * so finishing or skipping records it and replaces into the app, where the
 * dashboard sends a user with no group on to join-group. A replay is pushed
 * over settings by someone who has seen it, so it only closes.
 *
 * Swipeable, but every step is also a button: VoiceOver users and anyone who
 * doesn't think to swipe get the same path through.
 */
export default function TourScreen() {
  const router = useRouter();
  const { accent } = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { data: profile } = useProfile();
  const completeTour = useCompleteTour();

  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const count = TOUR_SLIDES.length;
  const isLast = index === count - 1;

  const finish = () => {
    // Read before `completeTour` patches the profile.
    const firstRun = !profile?.tour_seen_at;
    completeTour();
    if (firstRun) {
      router.replace("/");
    } else {
      router.back();
    }
  };

  const next = () => {
    if (isLast) return finish();
    const to = index + 1;
    setIndex(to);
    scrollRef.current?.scrollTo({ x: to * width, animated: !reduceMotion });
  };

  const onSwipeEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) {
      setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-row justify-end px-5 h-12 items-center">
        {isLast ? null : (
          <Pressable
            onPress={finish}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Skip"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text className="text-text-muted font-mono-medium text-base">
              Skip
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onSwipeEnd}
        style={{ flex: 1 }}
      >
        {TOUR_SLIDES.map((slide) => (
          <View
            key={slide.id}
            style={{ width }}
            className="flex-1 justify-center px-8"
          >
            <Text
              style={{ fontSize: 72 }}
              className="mb-8"
              accessible={false}
              importantForAccessibility="no"
            >
              {slide.emoji}
            </Text>
            <Text
              accessibilityRole="header"
              className="text-text font-mono-bold text-2xl mb-3"
            >
              {slide.title}
            </Text>
            <Text className="text-text-muted text-base leading-6">
              {slide.body}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View className="px-6 pb-6">
        <View
          className="flex-row justify-center gap-2 mb-3"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {TOUR_SLIDES.map((slide, i) => (
            <View
              key={slide.id}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor:
                  i === index ? accent.hex : themeColors.surface2,
              }}
            />
          ))}
        </View>
        <Text className="text-text-dim font-mono text-xs text-center mb-5">
          {`${index + 1} of ${count}`}
        </Text>
        <Pressable
          onPress={next}
          accessibilityRole="button"
          accessibilityLabel={isLast ? "Let's go" : "Next"}
          className="h-14 rounded-tile items-center justify-center"
          style={({ pressed }) => ({
            backgroundColor: accent.hex,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text className="font-mono-bold text-base text-bg">
            {isLast ? "Let's go" : "Next"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
