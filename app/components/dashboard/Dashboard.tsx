import { useState, useEffect, useMemo } from "react";
import { View, ScrollView, RefreshControl, Platform } from "react-native";
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
import { resolveViewedMemberId } from "@/lib/viewedMember";
import HabitManagerModal from "./HabitsManagerModal";
import NudgeButton from "./NudgeButton";
import NudgeModal from "./NudgeModal";
import { firstName, habitNudgeMessage } from "@/lib/nudge";
import { onShowTab } from "@/lib/notificationTaps";
import { OfflineBanner, OfflineRetry } from "./ConnectionNotice";

type PendingAction = { type: "edit" | "delete"; goal: Goal };

// `key` remounts the modal for every nudge, so its message starts from this
// prefill without an effect copying it into state.
type NudgeTarget = {
  userId: string;
  name: string;
  message: string;
  key: number;
};

// How long "Nudge sent to …" stays under the button.
const SENT_NOTICE_MS = 3000;

export default function Dashboard() {
  const { userId, refreshing, members, fetchData, offline } =
    useDashboardData();
  const { accent } = useTheme();

  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const insets = useSafeAreaInsets();
  const [isHabitManagerVisible, setIsHabitManagerVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  // `selectedTabId` is only what was tapped; the tab on screen is resolved
  // against the current members, so a buddy leaving the group drops the view
  // back to you instead of pointing at nobody.
  // A tapped notification picks the tab (`useNotificationTaps`): a nudge or a
  // reminder yours, a buddy event that buddy's.
  useEffect(() => onShowTab(setSelectedTabId), []);
  const viewedId = resolveViewedMemberId(members, selectedTabId, userId);
  const isViewingMe = viewedId === userId;
  const currentMember = members.find((m) => m.user_id === viewedId);

  const [nudgeTarget, setNudgeTarget] = useState<NudgeTarget | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const buddyName = firstName(currentMember?.full_name ?? "");

  const openNudge = (message: string) => {
    if (!viewedId || isViewingMe) return;
    setNudgeTarget({
      userId: viewedId,
      name: buddyName,
      message,
      key: Date.now(),
    });
  };

  // The confirmation clears itself; the timer is the only thing this effect
  // does, so it sets no state synchronously.
  useEffect(() => {
    if (!sentTo) return;
    const timer = setTimeout(() => setSentTo(null), SENT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [sentTo]);

  const todayGoals = useMemo(
    () => filterGoalsForToday(currentMember?.goals ?? []),
    [currentMember?.goals],
  );

  // The habit manager is a pageSheet modal. Presenting the edit/delete modal
  // while it is still dismissing drops the new modal on iOS, so a request from
  // the manager is queued, the sheet is closed, and the queued modal opens once
  // the sheet is actually gone.
  const openAction = ({ type, goal }: PendingAction) => {
    if (type === "edit") setEditingGoal(goal);
    else setDeletingGoal(goal);
  };

  // `Modal.onDismiss` is iOS-only. Elsewhere the sheet is gone as soon as it
  // stops rendering, so the request opens in the same update that closes it.
  const requestFromManager = (type: PendingAction["type"], goal: Goal) => {
    setIsHabitManagerVisible(false);
    if (Platform.OS === "ios") setPendingAction({ type, goal });
    else openAction({ type, goal });
  };

  const openPendingAction = () => {
    if (!pendingAction) return;
    openAction(pendingAction);
    setPendingAction(null);
  };

  if (!userId) return <View className="flex-1 bg-bg" />;

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={fetchData}
      tintColor={accent.hex}
      colors={[accent.hex]}
    />
  );

  if (offline === "screen") {
    return (
      <View className="flex-1 w-full bg-bg">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={refreshControl}
        >
          <OfflineRetry onRetry={fetchData} retrying={refreshing} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 w-full bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
      >
        {offline === "banner" ? <OfflineBanner /> : null}
        <DashboardHeader
          todayGoals={todayGoals}
          onOpenHabitManager={() => setIsHabitManagerVisible(true)}
        />
        <MemberTabs
          members={members}
          selectedTabId={viewedId || ""}
          onSelect={setSelectedTabId}
          userId={userId}
        />
        <View className="px-5 mt-3">
          {isViewingMe ? (
            <AddGoalInput />
          ) : (
            <NudgeButton
              name={buddyName}
              onPress={() => openNudge("")}
              sent={sentTo === viewedId}
            />
          )}

          {/* GoalList renders its own empty state — don't add a second one. */}
          <GoalList
            selectedTabId={viewedId}
            goals={todayGoals}
            onEdit={setEditingGoal}
            onDelete={setDeletingGoal}
            onNudge={(goal) =>
              openNudge(habitNudgeMessage(buddyName, goal.title))
            }
          />
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
      {nudgeTarget ? (
        <NudgeModal
          key={nudgeTarget.key}
          recipient={{ userId: nudgeTarget.userId, name: nudgeTarget.name }}
          initialMessage={nudgeTarget.message}
          isVisible
          onClose={() => setNudgeTarget(null)}
          onSent={() => setSentTo(nudgeTarget.userId)}
        />
      ) : null}
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
