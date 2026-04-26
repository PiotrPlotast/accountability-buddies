import "../../global.css";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDashboardActions } from "@/hooks/useDashboardActions";

const ICON_CHOICES = ["🧘", "📚", "💧", "🏃", "🎸", "✍️", "🥗", "💤"];
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export default function NewHabitScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeGroupId } = useDashboardData();
  const { addGoal } = useDashboardActions(activeGroupId);

  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>("🧘");
  const [repeatDays, setRepeatDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [submitting, setSubmitting] = useState(false);

  const canSave = title.trim().length > 0 && !submitting;

  const toggleDay = (d: number) => {
    setRepeatDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      await addGoal(title, { icon, repeatDays });
      router.back();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 h-14">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="w-10 h-10 items-center justify-center"
        >
          <Text className="text-text font-mono-medium text-2xl">‹</Text>
        </Pressable>
        <Text className="text-text font-mono-medium text-base">New habit</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          hitSlop={12}
          className="w-14 items-end justify-center"
        >
          <Text
            className={`font-mono-medium text-base ${canSave ? "text-neon" : "text-text-dim"}`}
          >
            {submitting ? "..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
          Habit name
        </Text>
        <View className="border-2 border-neon rounded-tile px-4 h-14 justify-center bg-bg">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Meditate 10 minutes"
            placeholderTextColor="#6B7280"
            className="text-text font-mono text-base"
            style={{ fontFamily: "GeistMono_400Regular" }}
            autoFocus
          />
        </View>

        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-8 mb-3">
          Pick an icon
        </Text>
        <View className="flex-row flex-wrap gap-3">
          {ICON_CHOICES.map((emoji) => {
            const selected = icon === emoji;
            return (
              <Pressable
                key={emoji}
                onPress={() => setIcon(emoji)}
                className={`w-14 h-14 rounded-tile items-center justify-center ${
                  selected ? "bg-neon" : "bg-surface border border-border"
                }`}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mt-8 mb-3">
          Repeat
        </Text>
        <View className="flex-row gap-2">
          {DAY_LABELS.map((label, idx) => {
            const selected = repeatDays.includes(idx);
            return (
              <Pressable
                key={idx}
                onPress={() => toggleDay(idx)}
                className={`flex-1 h-12 rounded-tile items-center justify-center ${
                  selected ? "bg-neon" : "bg-surface border border-border"
                }`}
              >
                <Text
                  className={`font-mono-medium ${selected ? "text-bg" : "text-text-muted"}`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View
        className="absolute left-0 right-0 bg-bg px-5"
        style={{ bottom: 0, paddingBottom: insets.bottom + 16, paddingTop: 12 }}
      >
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          className={`h-14 rounded-tile items-center justify-center ${canSave ? "bg-neon" : "bg-surface"}`}
        >
          {submitting ? (
            <ActivityIndicator color="#0B0B0C" />
          ) : (
            <Text
              className={`font-mono-bold text-base ${canSave ? "text-bg" : "text-text-dim"}`}
            >
              Create habit
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
