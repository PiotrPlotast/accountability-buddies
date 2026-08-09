import { useState, useEffect, useMemo } from "react";
import { View, ScrollView, RefreshControl, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useTheme } from "@/hooks/useTheme";
import EditGoalModal from "./EditGoalModal";
import DeleteGoalModal from "./DeleteGoalModal";
import DashboardHeader from "./DashboardHeader";
import MemberTabs from "./MemberTabs";
import AddGoalInput from "./AddGoalInput";
import GoalList from "./GoalList";
import { Goal } from "@/types/dashboardTypes";
import HabitManagerModal from "./HabitsManagerModal";
export default function Dashboard() {
  const { userId, loading, members, fetchData } = useDashboardData();
  const { accent } = useTheme();

  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const insets = useSafeAreaInsets();
  const [isHabitManagerVisible, setIsHabitManagerVisible] = useState(false);
  useEffect(() => {
    if (members.length > 0 && !selectedTabId) {
      setSelectedTabId(userId || members[0].user_id);
    }
  }, [members, userId, selectedTabId]);
  const isViewingMe = selectedTabId === userId;
  const currentMember = members.find((m) => m.user_id === selectedTabId);

  const todayGoals = useMemo(() => {
    if (!currentMember?.goals) return [];

    const todayJs = new Date().getDay();
    const currentDayIndex = todayJs;

    return currentMember.goals.filter((goal) => {
      if (!goal.repeat_days || goal.repeat_days.length === 0) return true;
      return goal.repeat_days.includes(currentDayIndex);
    });
  }, [currentMember?.goals]);

  if (!userId) return <View className="flex-1 bg-bg" />;

  return (
    <View className="flex-1 w-full bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => fetchData()}
            tintColor={accent.hex}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <DashboardHeader
          todayGoals={todayGoals}
          onOpenHabitManager={() => setIsHabitManagerVisible(true)}
        />
        <MemberTabs
          members={members}
          selectedTabId={selectedTabId || ""}
          onSelect={setSelectedTabId}
          userId={userId}
        />
        <View className="px-5 mt-3">
          {isViewingMe && <AddGoalInput />}

          <GoalList
            selectedTabId={selectedTabId}
            goals={todayGoals}
            onEdit={setEditingGoal}
            onDelete={setDeletingGoal}
          />

          {todayGoals.length === 0 && !isViewingMe && (
            <Text className="text-center text-text-dim font-mono mt-10">
              No habits scheduled for today.
            </Text>
          )}
        </View>
      </ScrollView>

      <EditGoalModal
        goal={editingGoal}
        isVisible={!!editingGoal}
        onClose={() => setEditingGoal(null)}
      />
      <DeleteGoalModal
        goal={deletingGoal}
        isVisible={!!deletingGoal}
        onClose={() => setDeletingGoal(null)}
      />
      <HabitManagerModal
        isVisible={isHabitManagerVisible}
        onClose={() => setIsHabitManagerVisible(false)}
        goals={currentMember?.goals || []}
        isViewingMe={isViewingMe}
        onEdit={setEditingGoal}
        onDelete={setDeletingGoal}
      />
    </View>
  );
}
