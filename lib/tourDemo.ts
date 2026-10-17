import { getRecentLocalDates } from "@/lib/date";
import { isDayComplete } from "@/lib/isDayComplete";
import { Goal, Member } from "@/types/dashboardTypes";

/**
 * The sample group the first-run tour's demos play with. It lives only in the
 * tour's component state: nothing here is cached, queued or sent, so a demo
 * can be ticked, edited, deleted and nudged freely.
 */

export const DEMO_ME = "tour-you";
const DEMO_ADA = "tour-ada";
const DEMO_BOB = "tour-bob";
const DEMO_GROUP = "tour-group";

/** Where the streak slide's counter starts. */
export const DEMO_STREAK = 4;

function sampleGoal(
  id: string,
  userId: string,
  title: string,
  icon: string,
  // Indexes into the trailing week, 0 = six days ago, 6 = today.
  doneDays: number[],
  today: string,
): Goal {
  const week = getRecentLocalDates(7, today);
  const completed_dates = doneDays.map((i) => week[i]);
  return {
    id,
    title,
    icon,
    user_id: userId,
    group_id: DEMO_GROUP,
    repeat_days: [],
    completed_dates,
    completed_today: completed_dates.includes(today),
  };
}

/** Your two sample habits, both still open today. */
export function demoMyGoals(today: string): Goal[] {
  return [
    sampleGoal(
      "tour-read",
      DEMO_ME,
      "Read 10 pages",
      "📚",
      [1, 2, 4, 5],
      today,
    ),
    sampleGoal("tour-run", DEMO_ME, "Go for a run", "🏃", [0, 3, 5], today),
  ];
}

/** You and two buddies, each buddy with one habit done and one open. */
export function demoMembers(today: string): Member[] {
  return [
    { user_id: DEMO_ME, full_name: "You", goals: demoMyGoals(today) },
    {
      user_id: DEMO_ADA,
      full_name: "Ada",
      goals: [
        sampleGoal(
          "tour-ada-stretch",
          DEMO_ADA,
          "Stretch",
          "🧘",
          [0, 1, 2, 3, 4, 5, 6],
          today,
        ),
        sampleGoal("tour-ada-run", DEMO_ADA, "Run", "🏃", [1, 4], today),
      ],
    },
    {
      user_id: DEMO_BOB,
      full_name: "Bob",
      goals: [
        sampleGoal(
          "tour-bob-water",
          DEMO_BOB,
          "Drink water",
          "💧",
          [2, 3, 4, 5, 6],
          today,
        ),
        sampleGoal(
          "tour-bob-guitar",
          DEMO_BOB,
          "Practise guitar",
          "🎸",
          [0, 2, 5],
          today,
        ),
      ],
    },
  ];
}

/**
 * Tick or untick one sample habit for `today`. `closedDay` is the same rule
 * `useToggleGoal` celebrates on: this tick, and only a tick, finished the day.
 */
export function toggleDemoGoal(
  goals: Goal[],
  goalId: string,
  today: string,
): { goals: Goal[]; closedDay: boolean } {
  const next = goals.map((goal) => {
    if (goal.id !== goalId) return goal;
    const done = !goal.completed_today;
    const others = (goal.completed_dates ?? []).filter((d) => d !== today);
    return {
      ...goal,
      completed_today: done,
      completed_dates: done ? [...others, today].sort() : others,
    };
  });
  return {
    goals: next,
    closedDay: !isDayComplete(goals) && isDayComplete(next),
  };
}
