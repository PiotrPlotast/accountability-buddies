import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/useTheme";
import { useCompleteTour } from "@/hooks/useTour";
import { tapLight } from "@/lib/haptics";
import { TOUR_SLIDES } from "@/lib/tour";
import TourDemo from "./TourDemos";

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
 * One slide at a time, moved by Back and Next rather than a horizontal pager:
 * the demos' habit rows swipe sideways themselves, and a pager would fight
 * them for the gesture.
 */
export default function Tour({ mode }: Props) {
  const router = useRouter();
  const { accent, colors } = useTheme();
  const completeTour = useCompleteTour();

  const [index, setIndex] = useState(0);
  const count = TOUR_SLIDES.length;
  const slide = TOUR_SLIDES[index];
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
    tapLight();
    setIndex(index + 1);
  };

  const back = () => {
    tapLight();
    setIndex(index - 1);
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
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Keyed by slide so each one starts fresh and fades in; opacity
            only, so Reduce Motion keeps it. */}
        <Reanimated.View key={slide.id} entering={FadeIn.duration(200)}>
          <Text
            accessibilityRole="header"
            className="text-text font-mono-bold text-2xl mb-2"
          >
            {slide.title}
          </Text>
          <Text className="text-text-muted text-base leading-6 mb-3">
            {slide.body}
          </Text>
          <Text
            style={{ color: accent.text }}
            className="font-mono-medium text-sm mb-5"
          >
            {slide.hint}
          </Text>
          <TourDemo id={slide.id} />
        </Reanimated.View>
      </ScrollView>

      <View className="px-5 pb-4 pt-3 border-t border-border">
        <View
          className="flex-row justify-center gap-2 mb-2"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {TOUR_SLIDES.map((s, i) => (
            <View
              key={s.id}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? accent.hex : colors.surface2,
              }}
            />
          ))}
        </View>
        <Text className="text-text-dim font-mono text-xs text-center mb-3">
          {`${index + 1} of ${count}`}
        </Text>
        <View className="flex-row gap-3">
          {index > 0 ? (
            <Pressable
              onPress={back}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="h-14 px-6 rounded-tile items-center justify-center bg-surface border border-border"
            >
              <Text className="font-mono-medium text-base text-text">Back</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={next}
            accessibilityRole="button"
            accessibilityLabel={isLast ? "Let's go" : "Next"}
            className="flex-1 h-14 rounded-tile items-center justify-center"
            // A plain object, never a `({ pressed }) => …` function: with a
            // className present NativeWind replaces the style prop and drops a
            // function outright, which left this button transparent with dark
            // text, invisible but still tappable.
            style={{ backgroundColor: accent.hex }}
          >
            <Text className="font-mono-bold text-base text-on-accent">
              {isLast ? "Let's go" : "Next"}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
