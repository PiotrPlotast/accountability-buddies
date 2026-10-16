import {
  DEMO_ME,
  demoMembers,
  demoMyGoals,
  toggleDemoGoal,
} from "@/lib/tourDemo";
import { getRecentLocalDates } from "@/lib/date";

const TODAY = "2026-10-16";

describe("tour sample data", () => {
  it("gives you two habits still open today", () => {
    const goals = demoMyGoals(TODAY);

    expect(goals.map((g) => g.title)).toEqual([
      "Read 10 pages",
      "Go for a run",
    ]);
    expect(goals.every((g) => !g.completed_today)).toBe(true);
    expect(goals.every((g) => g.user_id === DEMO_ME)).toBe(true);
  });

  it("gives the habits a past week so the dots under them aren't empty", () => {
    const week = getRecentLocalDates(7, TODAY);
    for (const goal of demoMyGoals(TODAY)) {
      expect(goal.completed_dates?.length).toBeGreaterThan(0);
      for (const date of goal.completed_dates ?? []) {
        expect(week).toContain(date);
        expect(date).not.toBe(TODAY);
      }
    }
  });

  it("puts you first and two buddies after, each with a habit open", () => {
    const members = demoMembers(TODAY);

    expect(members.map((m) => m.full_name)).toEqual(["You", "Ada", "Bob"]);
    expect(members[0].user_id).toBe(DEMO_ME);
    for (const buddy of members.slice(1)) {
      expect(buddy.goals.some((g) => !g.completed_today)).toBe(true);
    }
  });
});

describe("toggleDemoGoal", () => {
  it("ticks a habit for today without closing a day that has more left", () => {
    const goals = demoMyGoals(TODAY);

    const { goals: next, closedDay } = toggleDemoGoal(
      goals,
      goals[0].id,
      TODAY,
    );

    expect(next[0].completed_today).toBe(true);
    expect(next[0].completed_dates).toContain(TODAY);
    expect(closedDay).toBe(false);
  });

  it("reports the tick that closes the day", () => {
    let goals = demoMyGoals(TODAY);
    goals = toggleDemoGoal(goals, goals[0].id, TODAY).goals;

    const { closedDay } = toggleDemoGoal(goals, goals[1].id, TODAY);

    expect(closedDay).toBe(true);
  });

  it("unticks, taking today back out, and never calls that closing the day", () => {
    let goals = demoMyGoals(TODAY);
    goals = toggleDemoGoal(goals, goals[0].id, TODAY).goals;
    goals = toggleDemoGoal(goals, goals[1].id, TODAY).goals;

    const { goals: next, closedDay } = toggleDemoGoal(
      goals,
      goals[1].id,
      TODAY,
    );

    expect(next[1].completed_today).toBe(false);
    expect(next[1].completed_dates).not.toContain(TODAY);
    expect(closedDay).toBe(false);
  });

  it("leaves the list it was given alone", () => {
    const goals = demoMyGoals(TODAY);

    toggleDemoGoal(goals, goals[0].id, TODAY);

    expect(goals[0].completed_today).toBe(false);
  });
});
