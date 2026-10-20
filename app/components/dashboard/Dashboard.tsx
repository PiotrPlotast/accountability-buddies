import { useState, useEffect, useMemo } from "react";
import {
  AccessibilityInfo,
  View,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import { onlineManager } from "@tanstack/react-query";
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
import BuddyActions from "./BuddyActions";
import NudgeModal from "./NudgeModal";
import CheerModal from "./CheerModal";
import { firstName, habitNudgeMessage } from "@/lib/nudge";
import { onCheerRequest, onShowTab } from "@/lib/notificationTaps";
import type { CheerRequest } from "@/lib/cheer";
import { getTodayLocalDate } from "@/lib/date";
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

// The same for a cheer. The member is looked up at render, so a cheer asked
// for by a tap before the members have loaded still opens once they have, and
// one for somebody who has left the group opens nothing.
type CheerTarget = CheerRequest & { key: number };

// How long "Nudge sent to …" stays under the buttons.
const SENT_NOTICE_MS = 3000;

export default function Dashboard() {
  const {
    userId,
    refreshing,
    members,
    fetchData,
    offline,
    isOnline,
    pendingChanges,
  } = useDashboardData();
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
  const [cheerTarget, setCheerTarget] = useState<CheerTarget | null>(null);
  const [sent, setSent] = useState<{ to: string; notice: string } | null>(null);
  const buddyName = firstName(currentMember?.full_name ?? "");
  // Shown under the buttons and spoken, from the send itself rather than an
  // effect on `sent`: the line alone never reaches a screen reader.
  const confirmSent = (to: string, notice: string) => {
    setSent({ to, notice });
    AccessibilityInfo.announceForAccessibility(notice);
  };

  const openNudge = (message: string) => {
    if (!viewedId || isViewingMe || !isOnline) return;
    setNudgeTarget({
      userId: viewedId,
      name: buddyName,
      message,
      key: Date.now(),
    });
  };

  // A cheer needs the server, so offline it isn't opened at all, from the
  // button, a swipe or a tap — the same rule as the nudge. Read from
  // `onlineManager` itself, not a render's copy, so the tap listener below
  // never needs re-subscribing.
  const openCheer = (request: CheerRequest) => {
    if (!onlineManager.isOnline()) return;
    setCheerTarget({ ...request, key: Date.now() });
  };
  // A tapped buddy push asks for one (`useNotificationTaps`); the tab it
  // opens arrives separately, through `onShowTab`.
  useEffect(
    () =>
      onCheerRequest((request) => {
        if (onlineManager.isOnline()) {
          setCheerTarget({ ...request, key: Date.now() });
        }
      }),
    [],
  );
  const cheerMember = cheerTarget
    ? members.find(
        (m) => m.user_id === cheerTarget.buddyId && m.user_id !== userId,
      )
    : undefined;

  // The confirmation clears itself; the timer is the only thing this effect
  // does, so it sets no state synchronously.
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(null), SENT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [sent]);

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
      tintColor={accent.text}
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
        {offline === "banner" ? (
          <OfflineBanner pending={pendingChanges} />
        ) : null}
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
            <BuddyActions
              name={buddyName}
              onNudge={() => openNudge("")}
              onCheer={() =>
                viewedId &&
                openCheer({
                  buddyId: viewedId,
                  goal: null,
                  day: getTodayLocalDate(),
                })
              }
              sentNotice={sent?.to === viewedId ? sent.notice : null}
              disabled={!isOnline}
            />
          )}

          {/* GoalList renders its own empty state — don't add a second one. */}
          <GoalList
            selectedTabId={viewedId}
            goals={todayGoals}
            onEdit={setEditingGoal}
            onDelete={setDeletingGoal}
            // A nudge needs the server, so offline the swipe isn't offered.
            onNudge={
              isOnline
                ? (goal) => openNudge(habitNudgeMessage(buddyName, goal.title))
                : undefined
            }
            onCheer={
              isOnline && viewedId
                ? (goal) =>
                    openCheer({
                      buddyId: viewedId,
                      goal: { id: goal.id, title: goal.title },
                      day: getTodayLocalDate(),
                    })
                : undefined
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
          onSent={(name) =>
            confirmSent(nudgeTarget.userId, `Nudge sent to ${name}`)
          }
        />
      ) : null}
      {cheerTarget && cheerMember ? (
        <CheerModal
          key={cheerTarget.key}
          recipient={{
            userId: cheerTarget.buddyId,
            name: firstName(cheerMember.full_name ?? ""),
          }}
          goal={cheerTarget.goal}
          day={cheerTarget.day}
          isVisible
          onClose={() => setCheerTarget(null)}
          onSent={(name) =>
            confirmSent(cheerTarget.buddyId, `Cheer sent to ${name}`)
          }
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
