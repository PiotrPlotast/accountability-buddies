import { useState, useEffect, useMemo, useCallback } from "react";
import { View, ScrollView, RefreshControl, Text, Platform } from "react-native";
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
import { filterGoalsForToday } from "@/lib/repeatDays";
import HabitManagerModal from "./HabitsManagerModal";

type PendingAction = { type: "edit" | "delete"; goal: Goal };

export default function Dashboard() {
  const { userId, loading, members, fetchData } = useDashboardData();
  const { accent } = useTheme();

  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const insets = useSafeAreaInsets();
  const [isHabitManagerVisible, setIsHabitManagerVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  useEffect(() => {
    if (members.length > 0 && !selectedTabId) {
      setSelectedTabId(userId || members[0].user_id);
    }
  }, [members, userId, selectedTabId]);
  const isViewingMe = selectedTabId === userId;
  const currentMember = members.find((m) => m.user_id === selectedTabId);

  const todayGoals = useMemo(
    () => filterGoalsForToday(currentMember?.goals ?? []),
    [currentMember?.goals],
  );

  // The habit manager is a pageSheet modal. Presenting the edit/delete modal
  // while it is still dismissing drops the new modal on iOS, so a request from
  // the manager is queued, the sheet is closed, and the queued modal opens once
  // the sheet is actually gone.
  const requestFromManager = (type: PendingAction["type"], goal: Goal) => {
    setPendingAction({ type, goal });
    setIsHabitManagerVisible(false);
  };

  const openPendingAction = useCallback(() => {
    if (!pendingAction) return;
    if (pendingAction.type === "edit") setEditingGoal(pendingAction.goal);
    else setDeletingGoal(pendingAction.goal);
    setPendingAction(null);
  }, [pendingAction]);

  // `Modal.onDismiss` is iOS-only. Elsewhere the sheet is gone as soon as it
  // stops rendering, so flush as soon as visibility flips off.
  useEffect(() => {
    if (Platform.OS === "ios") return;
    if (!isHabitManagerVisible && pendingAction) openPendingAction();
  }, [isHabitManagerVisible, pendingAction, openPendingAction]);

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
        onDismiss={openPendingAction}
        goals={currentMember?.goals || []}
        isViewingMe={isViewingMe}
        onEdit={(goal) => requestFromManager("edit", goal)}
        onDelete={(goal) => requestFromManager("delete", goal)}
      />
    </View>
  );
}
