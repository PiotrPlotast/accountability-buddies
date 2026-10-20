import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import DeleteGoalModal from "@/app/components/dashboard/DeleteGoalModal";
import EditGoalModal from "@/app/components/dashboard/EditGoalModal";
import { GoalListView } from "@/app/components/dashboard/GoalList";
import MemberTabs from "@/app/components/dashboard/MemberTabs";
import BuddyActions from "@/app/components/dashboard/BuddyActions";
import NudgeModal from "@/app/components/dashboard/NudgeModal";
import ProgressRing from "@/app/components/dashboard/ProgressRing";
import TimePicker from "@/app/components/habits/TimePicker";
import { useTheme } from "@/hooks/useTheme";
import { getTodayLocalDate } from "@/lib/date";
import {
  celebrate,
  destructive,
  tapLight,
  toggleDone,
  toggleUndone,
} from "@/lib/haptics";
import { isDayComplete } from "@/lib/isDayComplete";
import { firstName, habitNudgeMessage } from "@/lib/nudge";
import { DEFAULT_REMINDER_TIME, formatReminderTime } from "@/lib/reminderTime";
import { filterGoalsForToday } from "@/lib/repeatDays";
import { TourSlide } from "@/lib/tour";
import {
  DEMO_ME,
  DEMO_STREAK,
  demoMembers,
  demoMyGoals,
  toggleDemoGoal,
} from "@/lib/tourDemo";
import { Goal } from "@/types/dashboardTypes";
import SectionLabel from "@/app/components/ui/SectionLabel";

/**
 * The live demos on the tour's slides. They are the dashboard's own pieces —
 * `GoalListView`, `ProgressRing`, `MemberTabs`, the edit, delete and nudge
 * sheets — driven by the sample group in `lib/tourDemo.ts` through component
 * state. Every write is replaced (`onSave`, `onConfirm`, `onSend`), so nothing
 * a demo does is cached, queued or sent.
 *
 * Haptics follow the real app, since every one of them answers a touch here
 * too. The day-close pulse is this ring's own `pulseKey`, never
 * `emitDayComplete()`: on a replay the real dashboard sits underneath and
 * would celebrate a sample day.
 */
export default function TourDemo({ id }: { id: TourSlide["id"] }) {
  switch (id) {
    case "habits":
      return <HabitsDemo />;
    case "manage":
      return <ManageDemo />;
    case "buddies":
      return <BuddiesDemo />;
    case "reminders":
      return <RemindersDemo />;
    case "streak":
      return <StreakDemo />;
  }
}

// Read once: a demo that rolled over at midnight would only confuse.
function useDemoToday() {
  const [today] = useState(getTodayLocalDate);
  return today;
}

type SampleHabitsProps = {
  goals: Goal[];
  onChange: (goals: Goal[]) => void;
  today: string;
  // Called on the tick that closes the day, after the celebration buzz.
  onDayClosed?: () => void;
  onReset?: () => void;
};

/** Your sample habits: tick, swipe to edit, swipe to delete. */
function SampleHabits({
  goals,
  onChange,
  today,
  onDayClosed,
  onReset,
}: SampleHabitsProps) {
  const { accent } = useTheme();
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const visible = filterGoalsForToday(goals);

  const toggle = (goal: Goal) => {
    const next = toggleDemoGoal(goals, goal.id, today);
    if (goal.completed_today) {
      toggleUndone();
    } else if (next.closedDay) {
      celebrate();
      onDayClosed?.();
    } else {
      toggleDone();
    }
    onChange(next.goals);
  };

  return (
    <View>
      <GoalListView
        goals={visible}
        loading={false}
        canEdit
        onToggle={toggle}
        onEdit={setEditing}
        onDelete={setDeleting}
      />
      {onReset && visible.length < 2 ? (
        <Pressable
          onPress={() => {
            tapLight();
            onReset();
          }}
          accessibilityRole="button"
          accessibilityLabel="Bring the samples back"
          hitSlop={8}
          className="self-center mt-4"
        >
          <Text
            style={{ color: accent.text }}
            className="font-mono-medium text-sm"
          >
            Bring the samples back
          </Text>
        </Pressable>
      ) : null}

      {editing ? (
        <EditGoalModal
          goal={editing}
          isVisible
          onClose={() => setEditing(null)}
          onSave={async (goalId, edit) => {
            tapLight();
            onChange(
              goals.map((g) =>
                g.id === goalId
                  ? {
                      ...g,
                      title: edit.title.trim(),
                      icon: edit.icon,
                      repeat_days: edit.repeatDays,
                      reminder_time: edit.reminderTime,
                    }
                  : g,
              ),
            );
          }}
        />
      ) : null}
      {deleting ? (
        <DeleteGoalModal
          goal={deleting}
          isVisible
          onClose={() => setDeleting(null)}
          onConfirm={async (goal) => {
            destructive();
            onChange(goals.filter((g) => g.id !== goal.id));
          }}
        />
      ) : null}
    </View>
  );
}

function useSampleGoals() {
  const today = useDemoToday();
  const [goals, setGoals] = useState(() => demoMyGoals(today));
  const reset = () => setGoals(demoMyGoals(today));
  return { today, goals, setGoals, reset };
}

function HabitsDemo() {
  const { today, goals, setGoals, reset } = useSampleGoals();
  const [pulseKey, setPulseKey] = useState(0);
  const due = filterGoalsForToday(goals);
  const done = due.filter((g) => g.completed_today).length;

  return (
    <View>
      <View className="items-center mb-5">
        <ProgressRing
          size={96}
          stroke={8}
          progress={due.length > 0 ? done / due.length : 0}
          pulseKey={pulseKey}
        />
      </View>
      <SampleHabits
        goals={goals}
        onChange={setGoals}
        today={today}
        onDayClosed={() => setPulseKey((k) => k + 1)}
        onReset={reset}
      />
    </View>
  );
}

function ManageDemo() {
  const { today, goals, setGoals, reset } = useSampleGoals();
  return (
    <SampleHabits
      goals={goals}
      onChange={setGoals}
      today={today}
      onReset={reset}
    />
  );
}

type NudgeDraft = {
  userId: string;
  name: string;
  message: string;
  key: number;
};

function BuddiesDemo() {
  const today = useDemoToday();
  const [members] = useState(() => demoMembers(today));
  const [mine, setMine] = useState(() => members[0].goals);
  const [selected, setSelected] = useState(DEMO_ME);
  const [draft, setDraft] = useState<NudgeDraft | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const shown = members.map((m) =>
    m.user_id === DEMO_ME ? { ...m, goals: mine } : m,
  );
  const viewed = shown.find((m) => m.user_id === selected) ?? shown[0];
  const name = firstName(viewed.full_name);

  const openNudge = (message: string) =>
    setDraft((d) => ({
      userId: viewed.user_id,
      name,
      message,
      key: (d?.key ?? 0) + 1,
    }));

  return (
    <View>
      <View className="-mx-5 mb-4">
        <MemberTabs
          members={shown}
          selectedTabId={viewed.user_id}
          onSelect={setSelected}
          userId={DEMO_ME}
        />
      </View>

      {viewed.user_id === DEMO_ME ? (
        <SampleHabits
          goals={mine}
          onChange={setMine}
          today={today}
          onReset={() => setMine(members[0].goals)}
        />
      ) : (
        <View>
          <BuddyActions
            name={name}
            onNudge={() => openNudge("")}
            sentNotice={sentTo === name ? `Nudge sent to ${name}` : null}
          />
          <GoalListView
            goals={filterGoalsForToday(viewed.goals)}
            loading={false}
            canEdit={false}
            onToggle={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
            onNudge={(goal) => openNudge(habitNudgeMessage(name, goal.title))}
          />
        </View>
      )}

      {draft ? (
        <NudgeModal
          key={draft.key}
          recipient={{ userId: draft.userId, name: draft.name }}
          initialMessage={draft.message}
          isVisible
          onClose={() => setDraft(null)}
          onSent={setSentTo}
          // The real app buzzes on the server's confirmation; here the
          // confirmation is immediate.
          onSend={async () => celebrate()}
        />
      ) : null}
    </View>
  );
}

function RemindersDemo() {
  const [time, setTime] = useState<string | null>(null);

  return (
    <View>
      <View className="bg-surface border border-border rounded-tile px-4 py-4 flex-row items-center mb-3">
        <Text style={{ fontSize: 18 }} className="mr-3">
          📚
        </Text>
        <Text className="text-text text-base font-semibold">Read 10 pages</Text>
      </View>
      <TimePicker
        label="Reminder"
        value={time}
        onChange={setTime}
        defaultTime={DEFAULT_REMINDER_TIME}
      />
      <Text className="text-text-muted font-mono text-xs mt-3">
        {time
          ? `We'll remind you at ${formatReminderTime(time)} if it isn't ticked by then.`
          : "No reminder set."}
      </Text>
    </View>
  );
}

function StreakDemo() {
  const { today, goals, setGoals, reset } = useSampleGoals();
  const { accent } = useTheme();
  // Derived, the way the server takes a day back when its closing tick is
  // undone: finishing the sample day adds one, unticking removes it again.
  const streak = DEMO_STREAK + (isDayComplete(goals) ? 1 : 0);

  return (
    <View>
      <View
        accessible
        accessibilityLabel={`Group streak, ${streak} days`}
        className="bg-surface border border-border rounded-tile px-4 py-5 items-center mb-4"
      >
        <Text style={{ fontSize: 32 }}>🔥</Text>
        <Text
          style={{ color: accent.text }}
          className="font-mono-bold text-3xl mt-1"
        >
          {streak}
        </Text>
        <SectionLabel className="mt-1">day group streak</SectionLabel>
      </View>
      <SampleHabits
        goals={goals}
        onChange={setGoals}
        today={today}
        onReset={reset}
      />
    </View>
  );
}
