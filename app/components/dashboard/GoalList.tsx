import { View, Text, TouchableOpacity } from "react-native";
import { Goal } from "@/types/dashboardTypes";

type Props = {
  goals: Goal[];
  isViewingMe: boolean;
  isLoading: boolean;
  onToggle: (goal: Goal) => void;
};

export default function GoalList({
  goals,
  isViewingMe,
  isLoading,
  onToggle,
}: Props) {
  if (isLoading) {
    return (
      <View style={{ gap: 12 }}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              height: 64, // h-16
              backgroundColor: "#f3f4f6", // bg-gray-100
              borderRadius: 12, // rounded-xl
              borderWidth: 1,
              borderColor: "transparent",
              opacity: 0.5,
            }}
          />
        ))}
      </View>
    );
  }

  if (goals.length === 0) {
    return (
      <View
        style={{
          marginTop: 40, // mt-10
          alignItems: "center",
          justifyContent: "center",
          padding: 24, // p-6
          backgroundColor: "#f9fafb", // bg-gray-50
          borderRadius: 12, // rounded-xl
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: "#e5e7eb", // border-gray-200
        }}
      >
        <Text
          style={{
            color: "#9ca3af", // text-gray-400
            fontStyle: "italic",
            textAlign: "center",
          }}
        >
          {isViewingMe
            ? "No habits yet. Add one above! 👆"
            : "They haven't added any habits yet. 😴"}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {goals.map((goal) => {
        const isCompleted = goal.completed_today;

        const containerStyle = isCompleted
          ? isViewingMe
            ? { backgroundColor: "#f0fdf4", borderColor: "#22c55e" } // bg-green-50 border-green-500
            : { backgroundColor: "#eef2ff", borderColor: "#c7d2fe" } // bg-indigo-50 border-indigo-200
          : {
              backgroundColor: "#ffffff", // bg-white
              borderColor: "#e2e8f0", // border-slate-200
              // shadow-sm implementation:
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 2,
              elevation: 2,
            };

        const textColor = isCompleted
          ? isViewingMe
            ? "#166534" // text-green-800
            : "#3730a3" // text-indigo-800
          : isViewingMe
            ? "#1e293b" // text-slate-800
            : "#9ca3af"; // text-gray-400

        return (
          <TouchableOpacity
            key={goal.id}
            disabled={!isViewingMe}
            onPress={() => onToggle(goal)}
            style={{
              padding: 20, // p-5
              borderRadius: 12, // rounded-xl
              borderWidth: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              ...containerStyle, // Rozpakowanie warunkowych stylów
            }}
          >
            <Text
              style={{
                fontSize: 18, // text-lg
                fontWeight: "500", // font-medium
                color: textColor,
              }}
            >
              {goal.title}
            </Text>

            {/* Status Icon */}
            {isCompleted && (
              <Text style={{ fontSize: 20 }}>{isViewingMe ? "✅" : "🔥"}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
