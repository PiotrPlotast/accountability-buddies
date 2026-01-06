import { View, Text, TouchableOpacity } from "react-native";
import { Goal } from "@/types/dashboardTypes";

type Props = {
  goals: Goal[];
  isViewingMe: boolean;
  isLoading: boolean; // <--- 1. Add this prop
  onToggle: (goal: Goal) => void;
};

export default function GoalList({
  goals,
  isViewingMe,
  isLoading,
  onToggle,
}: Props) {
  // 2. Handle Loading State (Prevents the "No habits" flash)
  if (isLoading) {
    return (
      <View className="gap-3">
        {/* Render 3 fake placeholder rows */}
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            className="h-16 bg-gray-100 rounded-xl border border-transparent opacity-50"
            // Note: If you have NativeWind set up for animations, you can add 'animate-pulse' here
          />
        ))}
      </View>
    );
  }

  // 3. Handle Empty State (Only shows if strictly NOT loading)
  if (goals.length === 0) {
    return (
      <View className="mt-10 items-center justify-center p-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <Text className="text-gray-400 italic text-center">
          {isViewingMe
            ? "No habits yet. Add one above! 👆"
            : "They haven't added any habits yet. 😴"}
        </Text>
      </View>
    );
  }

  // 4. Handle Real Data
  return (
    <View className="gap-3">
      {goals.map((goal) => {
        const isCompleted = goal.completed_today;

        // Dynamic Styling Logic
        const containerStyle = isCompleted
          ? isViewingMe
            ? "bg-green-50 border-green-500"
            : "bg-indigo-50 border-indigo-200"
          : "bg-white border-slate-200 shadow-sm";

        const textStyle = isCompleted
          ? isViewingMe
            ? "text-green-800"
            : "text-indigo-800"
          : isViewingMe
            ? "text-slate-800"
            : "text-gray-400";

        return (
          <TouchableOpacity
            key={goal.id}
            disabled={!isViewingMe || isCompleted}
            onPress={() => onToggle(goal)}
            className={`p-5 rounded-xl border flex-row items-center justify-between ${containerStyle}`}
          >
            <Text className={`text-lg font-medium ${textStyle}`}>
              {goal.title}
            </Text>

            {/* Status Icon */}
            {isCompleted && (
              <Text className="text-xl">{isViewingMe ? "✅" : "🔥"}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
