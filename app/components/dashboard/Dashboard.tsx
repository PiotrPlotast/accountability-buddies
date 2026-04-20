import { useState, useEffect } from "react";
import { View, ScrollView, RefreshControl, Text } from "react-native";
import { useDashboardData } from "@/hooks/useDashboardData";
import EditGoalModal from "./EditGoalModal";
import DeleteGoalModal from "./DeleteGoalModal";
import DashboardHeader from "./DashboardHeader";
import MemberTabs from "./MemberTabs";
import AddGoalInput from "./AddGoalInput";
import GoalList from "./GoalList";
import { Goal } from "@/types/dashboardTypes";

export default function Dashboard() {
  const { userId, loading, members, fetchData } = useDashboardData();

  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);

  // Set default tab once members load
  useEffect(() => {
    if (members.length > 0 && !selectedTabId) {
      setSelectedTabId(userId || members[0].user_id);
    }
  }, [members, userId, selectedTabId]);

  if (!userId) return <View />;

  const currentMember = members.find((m) => m.user_id === selectedTabId);
  const isViewingMe = selectedTabId === userId;

  return (
    <View className="flex-1 w-full bg-slate-50">
      <DashboardHeader />

      <MemberTabs
        members={members}
        selectedTabId={selectedTabId || ""}
        onSelect={setSelectedTabId}
        userId={userId}
      />

      <ScrollView
        className="flex-1 p-4"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => fetchData()} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {isViewingMe && <AddGoalInput />}

        <GoalList
          selectedTabId={selectedTabId}
          onEdit={setEditingGoal}
          onDelete={setDeletingGoal}
        />
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
        {currentMember?.goals.length === 0 && (
          <Text className="text-center text-gray-300 mt-10 italic">
            No habits yet.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
