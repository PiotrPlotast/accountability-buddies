import { useState, useEffect } from "react";
import { View, ScrollView, RefreshControl, Text } from "react-native";
import { useDashboard } from "@/hooks/useDashboard";

import DashboardHeader from "./DashboardHeader";
import MemberTabs from "./MemberTabs";
import AddGoalInput from "./AddGoalInput";
import GoalList from "./GoalList";

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
  } = useDashboard();

  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

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
    <View className="flex-1 bg-white">
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
        className="flex-1 p-4"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => fetchData(true)}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {isViewingMe && <AddGoalInput onAdd={addGoal} />}

        <GoalList
          goals={currentMember?.goals || []}
          isViewingMe={isViewingMe}
          onToggle={toggleGoal}
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
