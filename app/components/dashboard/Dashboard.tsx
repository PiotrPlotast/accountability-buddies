import { useState, useEffect } from "react";
import { View, ScrollView, RefreshControl, Text } from "react-native";
import { useDashboard } from "@/hooks/useDashboard";
import EditGoalModal from "./EditGoalModal";
import DeleteGoalModal from "./DeleteGoalModal";
import DashboardHeader from "./DashboardHeader";
import MemberTabs from "./MemberTabs";
import AddGoalInput from "./AddGoalInput";
import GoalList from "./GoalList";
import { Goal } from "@/types/dashboardTypes";
export default function Dashboard() {
  const {
    userId,
    loading,
    groupName,
    streak,
    inviteCode,
    members,
    isWaiting,
    fetchData,
    toggleGoal,
    addGoal,
    deleteGoal,
    editGoal,
  } = useDashboard();

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
  const isInitializing = members.length > 0 && !currentMember;
  const isViewingMe = selectedTabId === userId;
  const handleEditPress = (goal: Goal) => {
    setEditingGoal(goal);
  };
  const handleDeletePress = (goal: Goal) => {
    setDeletingGoal(goal);
  };
  return (
    <View className="flex-1 w-full bg-slate-50">
      <DashboardHeader
        groupName={groupName}
        streak={streak}
        inviteCode={inviteCode}
        isWaiting={isWaiting}
      />

      <MemberTabs
        members={members}
        selectedTabId={selectedTabId || ""}
        onSelect={setSelectedTabId}
        userId={userId}
      />

      <ScrollView
        className="flex-1 max-h-[550px] p-4"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => fetchData()} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {isViewingMe && <AddGoalInput onAdd={addGoal} />}

        <GoalList
          goals={currentMember?.goals || []}
          isViewingMe={isViewingMe}
          onToggle={toggleGoal}
          isLoading={loading || isInitializing}
          onEdit={handleEditPress}
          onDelete={handleDeletePress}
        />
        <EditGoalModal
          goal={editingGoal}
          isVisible={!!editingGoal}
          onClose={() => setEditingGoal(null)}
          onSave={async (newTitle) => {
            if (editingGoal?.id) {
              await editGoal(editingGoal.id, newTitle);
              setEditingGoal(null); // Close modal only after starting update
            } else {
              console.warn(
                "Attempted to save, but editingGoal.id was undefined",
              );
            }
          }}
        />
        <DeleteGoalModal
          goal={deletingGoal}
          onDelete={async (goalId) => {
            await deleteGoal(goalId);
            setDeletingGoal(null);
          }}
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
