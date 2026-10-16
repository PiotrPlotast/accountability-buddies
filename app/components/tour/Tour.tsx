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

import { useTheme } from "@/hooks/useTheme";
import { useCompleteTour } from "@/hooks/useTour";
import { themeColors } from "@/lib/colors";
import { TOUR_SLIDES } from "@/lib/tour";

type Props = {
  mode: "firstRun" | "replay";
};

/**
 * The walkthrough, shared by its two routes.
 *
 * `firstRun` is `(protected)/tour.tsx`, the only screen mounted while the
 * tour gate holds. Finishing or skipping records it and navigates nowhere:
 * the gate flips and the layout's guard swaps the app in, the way the name
 * screen hands over. Navigating from here raced that guard (the app routes
 * were still guarded off when the replace ran, so the tour stayed up).
 * `replay` is `(protected)/tour-replay.tsx`, pushed from settings by someone
 * who has seen it, so it writes nothing and only goes back.
 *
 * Swipeable, but every step is also a button: VoiceOver users and anyone who
 * doesn't think to swipe get the same path through.
 */
export default function Tour({ mode }: Props) {
  const router = useRouter();
  const { accent } = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const completeTour = useCompleteTour();

  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const count = TOUR_SLIDES.length;
  const isLast = index === count - 1;

  const finish = () => {
    if (mode === "replay") {
      router.back();
      return;
    }
    completeTour();
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
