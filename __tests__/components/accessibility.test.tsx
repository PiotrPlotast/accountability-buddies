import { Text } from "react-native";
import { act, fireEvent, render, within } from "@testing-library/react-native";

import DialogShell from "@/app/components/ui/DialogShell";
import AuthField from "@/app/components/ui/AuthField";
import ScreenHeader from "@/app/components/ui/ScreenHeader";
import SwipeAction from "@/app/components/dashboard/SwipeAction";
import { GoalListView } from "@/app/components/dashboard/GoalList";
import ComposeModal from "@/app/components/dashboard/ComposeModal";
import DeleteGoalModal from "@/app/components/dashboard/DeleteGoalModal";
import HabitManagerModal from "@/app/components/dashboard/HabitsManagerModal";
import AddGoalInput from "@/app/components/dashboard/AddGoalInput";
import BuddyActions from "@/app/components/dashboard/BuddyActions";
import HabitFormFields from "@/app/components/habits/HabitFormFields";
import WelcomeScreen from "@/app/(public)/welcome";
import SignInScreen from "@/app/(public)/sign-in";
import SignUpScreen from "@/app/(public)/sign-up";
import JoinGroupScreen from "@/app/(protected)/join-group";
import GroupSettingsScreen from "@/app/(protected)/group-settings";
import { themeColors } from "@/lib/colors";
import { Goal } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryClient,
} from "../test-utils/render";

beforeEach(() => jest.clearAllMocks());

const goal: Goal = {
  id: "g-1",
  title: "Read",
  user_id: "me",
  group_id: "group-1",
  completed_today: false,
  icon: "📚",
  repeat_days: [],
};

function withWrapper(ui: React.ReactElement) {
  const { Wrapper } = buildWrapper({
    supabase: buildFakeSupabase({}),
    queryClient: makeQueryClient(),
  });
  return render(ui, { wrapper: Wrapper });
}

// On iOS an accessible view hides everything inside it from VoiceOver, and a
// Pressable is accessible by default. A card nested in the backdrop button
// was one "Cancel" element: no field, no confirm button.
describe("DialogShell", () => {
  it("keeps the card out of the backdrop button", () => {
    const { getByRole } = render(
      <DialogShell
        isVisible
        onRequestClose={jest.fn()}
        onBackdropPress={jest.fn()}
        backdropLabel="Cancel"
      >
        <Text>Inside the card</Text>
      </DialogShell>,
    );

    const backdrop = getByRole("button", { name: "Cancel" });
    expect(within(backdrop).queryByText("Inside the card")).toBeNull();
  });

  it("keeps the card out of a backdrop that does nothing", () => {
    const { getByText, UNSAFE_root } = render(
      <DialogShell isVisible onRequestClose={jest.fn()} backdropLabel="Close">
        <Text>Inside the card</Text>
      </DialogShell>,
    );

    // No ancestor of the card's text may be an accessibility element.
    let node = getByText("Inside the card").parent;
    while (node && node !== UNSAFE_root) {
      expect(node.props.accessible).not.toBe(true);
      node = node.parent;
    }
  });

  // VoiceOver's two-finger scrub is the screen reader's tap outside.
  it("closes on the escape gesture the way the backdrop does", () => {
    const onBackdropPress = jest.fn();
    const { getByTestId } = render(
      <DialogShell
        isVisible
        onRequestClose={jest.fn()}
        onBackdropPress={onBackdropPress}
        backdropLabel="Cancel"
      >
        <Text>Card</Text>
      </DialogShell>,
    );

    fireEvent(getByTestId("dialog-shell"), "accessibilityEscape");

    expect(onBackdropPress).toHaveBeenCalledTimes(1);
  });

  it("falls back to the close handler when the backdrop does nothing", () => {
    const onRequestClose = jest.fn();
    const { getByTestId } = render(
      <DialogShell
        isVisible
        onRequestClose={onRequestClose}
        backdropLabel="Close"
      >
        <Text>Card</Text>
      </DialogShell>,
    );

    fireEvent(getByTestId("dialog-shell"), "accessibilityEscape");

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("ignores the escape gesture while nothing may close it", () => {
    const { getByTestId } = render(
      <DialogShell isVisible onRequestClose={undefined} backdropLabel="Close">
        <Text>Card</Text>
      </DialogShell>,
    );

    expect(() =>
      fireEvent(getByTestId("dialog-shell"), "accessibilityEscape"),
    ).not.toThrow();
  });
});

describe("Delete habit dialog", () => {
  it("announces Cancel and Delete as buttons", () => {
    const { getAllByRole, getByRole } = withWrapper(
      <DeleteGoalModal goal={goal} isVisible onClose={jest.fn()} />,
    );

    expect(getByRole("button", { name: "Delete" })).toBeTruthy();
    // The backdrop is a Cancel too; the card's own button must be one.
    expect(getAllByRole("button", { name: "Cancel" })).toHaveLength(2);
  });

  it("marks its title as a heading", () => {
    const { getByRole } = withWrapper(
      <DeleteGoalModal goal={goal} isVisible onClose={jest.fn()} />,
    );

    expect(getByRole("header", { name: "Delete habit?" })).toBeTruthy();
  });
});

describe("Compose dialog", () => {
  function renderCompose() {
    return render(
      <ComposeModal
        title="Nudge Ada"
        presets={["You got this!"]}
        maxLength={140}
        inputLabel="Nudge message"
        isVisible
        isPending={false}
        onClose={jest.fn()}
        onSend={jest.fn(() => Promise.resolve())}
      />,
    );
  }

  it("announces presets, Cancel and Send as buttons", () => {
    const { getByRole, getAllByRole } = renderCompose();

    expect(getByRole("button", { name: "You got this!" })).toBeTruthy();
    expect(getByRole("button", { name: "Send" })).toBeTruthy();
    expect(getAllByRole("button", { name: "Cancel" })).toHaveLength(2);
  });

  it("reads the counter as words, not a fraction", () => {
    const { getByLabelText } = renderCompose();

    expect(getByLabelText("0 of 140 characters")).toBeTruthy();
  });

  it("marks its title as a heading", () => {
    const { getByRole } = renderCompose();

    expect(getByRole("header", { name: "Nudge Ada" })).toBeTruthy();
  });
});

// The swipes have no screen-reader equivalent, and a single-habit cheer has
// no other route at all, so every row offers its swipe as an action.
// A ticked row is dimmed by its background alone, never by opacity: a faded
// row took its text down with it, to about 1.9:1. `text-dim` on `bg` is 5.6:1.
describe("Ticked habit rows", () => {
  const rowClass = (completed_today: boolean) =>
    render(
      <GoalListView
        goals={[{ ...goal, completed_today }]}
        loading={false}
        canEdit
        onToggle={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    ).getByLabelText("Read").props.className as string;

  it("sits on the darker background when ticked", () => {
    expect(rowClass(true)).toMatch(/\bbg-bg\b/);
    expect(rowClass(true)).not.toMatch(/opacity-/);
  });

  it("keeps the card colour when not ticked", () => {
    expect(rowClass(false)).toMatch(/\bbg-surface\b/);
  });
});

describe("Habit row actions", () => {
  function renderRow(props: Partial<Parameters<typeof GoalListView>[0]>) {
    const handlers = {
      onToggle: jest.fn(),
      onEdit: jest.fn(),
      onDelete: jest.fn(),
      onNudge: jest.fn(),
      onCheer: jest.fn(),
    };
    const utils = render(
      <GoalListView
        goals={[goal]}
        loading={false}
        canEdit
        {...handlers}
        {...props}
      />,
    );
    return { ...utils, ...handlers };
  }

  const actionNames = (row: { props: Record<string, unknown> }) =>
    ((row.props.accessibilityActions as { name: string }[]) ?? []).map(
      (a) => a.name,
    );

  it("offers edit and delete on your own habit", () => {
    const { getByLabelText, onEdit, onDelete } = renderRow({});
    const row = getByLabelText("Read");

    expect(actionNames(row)).toEqual(["edit", "delete"]);

    fireEvent(row, "accessibilityAction", {
      nativeEvent: { actionName: "edit" },
    });
    fireEvent(row, "accessibilityAction", {
      nativeEvent: { actionName: "delete" },
    });

    expect(onEdit).toHaveBeenCalledWith(goal);
    expect(onDelete).toHaveBeenCalledWith(goal);
  });

  it("offers a nudge on a buddy's unticked habit", () => {
    const { getByLabelText, onNudge } = renderRow({ canEdit: false });
    const row = getByLabelText("Read");

    expect(actionNames(row)).toEqual(["nudge"]);

    // Called directly: a buddy's row is disabled for taps, which stops the
    // test renderer's events, but an accessibility action is no tap.
    act(() =>
      row.props.onAccessibilityAction({ nativeEvent: { actionName: "nudge" } }),
    );
    expect(onNudge).toHaveBeenCalledWith(goal);
  });

  it("offers a cheer on a buddy's ticked habit", () => {
    const ticked = { ...goal, completed_today: true };
    const { getByLabelText, onCheer } = renderRow({
      canEdit: false,
      goals: [ticked],
    });
    const row = getByLabelText("Read");

    expect(actionNames(row)).toEqual(["cheer"]);

    // Called directly: a buddy's row is disabled for taps, which stops the
    // test renderer's events, but an accessibility action is no tap.
    act(() =>
      row.props.onAccessibilityAction({ nativeEvent: { actionName: "cheer" } }),
    );
    expect(onCheer).toHaveBeenCalledWith(ticked);
  });

  it("offers nothing on a buddy's habit when there is no swipe either", () => {
    const { getByLabelText } = renderRow({
      canEdit: false,
      onNudge: undefined,
      onCheer: undefined,
    });

    expect(actionNames(getByLabelText("Read"))).toEqual([]);
  });

  it("names each action for the screen reader", () => {
    const { getByLabelText } = renderRow({});
    const actions = getByLabelText("Read").props.accessibilityActions as {
      label: string;
    }[];

    expect(actions.map((a) => a.label)).toEqual(["Edit", "Delete"]);
  });
});

describe("Swipe action tile", () => {
  it("is a button named by its label, not its emoji", () => {
    const { getByRole } = render(
      <SwipeAction
        drag={{ value: 0 } as never}
        side="right"
        tone="danger"
        emoji="🗑️"
        label="Delete"
        onPress={jest.fn()}
      />,
    );

    expect(getByRole("button", { name: "Delete" })).toBeTruthy();
  });
});

describe("Dashboard buttons", () => {
  it("announces Add a new habit as a button", () => {
    const { getByRole } = render(<AddGoalInput />);

    expect(getByRole("button", { name: "Add a new habit" })).toBeTruthy();
  });

  it("names the buddy buttons without their emoji", () => {
    const { getByRole } = render(
      <BuddyActions
        name="Ada"
        onNudge={jest.fn()}
        onCheer={jest.fn()}
        sentNotice={null}
      />,
    );

    expect(getByRole("button", { name: "Nudge Ada" })).toBeTruthy();
    expect(getByRole("button", { name: "Cheer Ada" })).toBeTruthy();
  });

  it("announces the habit list's Done as a button and its title as a heading", () => {
    const { getByRole } = withWrapper(
      <HabitManagerModal
        isVisible
        onClose={jest.fn()}
        goals={[goal]}
        isViewingMe
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(getByRole("button", { name: "Done" })).toBeTruthy();
    expect(getByRole("header", { name: "All Habits" })).toBeTruthy();
  });
});

describe("Text fields carry their visible label", () => {
  it("labels an auth field with its caption", () => {
    const { getByLabelText } = render(
      <AuthField label="Email" placeholder="you@example.com" />,
    );

    expect(getByLabelText("Email").props.placeholder).toBe("you@example.com");
  });

  it("labels the habit name field", () => {
    const { getByLabelText } = withWrapper(
      <HabitFormFields
        title=""
        onTitleChange={jest.fn()}
        titlePlaceholder="Meditate 10 minutes"
        icon={null}
        onIconChange={jest.fn()}
        repeatDays={[]}
        onRepeatDaysChange={jest.fn()}
        reminderTime={null}
        onReminderTimeChange={jest.fn()}
      />,
    );

    expect(getByLabelText("Habit name").props.placeholder).toBe(
      "Meditate 10 minutes",
    );
  });

  it("labels the invite code and the new group's name", () => {
    const { getByLabelText, getByRole } = withWrapper(<JoinGroupScreen />);

    expect(getByLabelText("Invite code").props.placeholder).toBe("A1B2C3D4E5");

    fireEvent.press(
      getByRole("button", { name: "No code? Create a new group" }),
    );

    expect(getByLabelText("Group name").props.placeholder).toBe("Swole Mates");
  });

  it("labels the group name in group settings", () => {
    const { getByLabelText } = withWrapper(<GroupSettingsScreen />);

    expect(getByLabelText("Group name").props.placeholder).toBe("Swole Mates");
  });
});

describe("Group settings controls", () => {
  it("names the accent swatches and marks the selected one", () => {
    const { getByRole } = withWrapper(<GroupSettingsScreen />);

    const swatch = getByRole("button", { name: "Neon accent" });
    expect(swatch.props.accessibilityState).toMatchObject({ selected: true });
  });

  it("announces the invite code tile as a copy button", () => {
    const { getByRole } = withWrapper(<GroupSettingsScreen />);

    expect(getByRole("button", { name: /^Copy invite code/ })).toBeTruthy();
  });

  it("announces the header's Save as a button", () => {
    const { getByRole } = withWrapper(<GroupSettingsScreen />);

    // The bottom one is "Save changes".
    expect(getByRole("button", { name: "Save" })).toBeTruthy();
  });
});

describe("Headings", () => {
  it("marks a modal screen's title as a heading", () => {
    const { getByRole } = render(<ScreenHeader title="New habit" />);

    expect(getByRole("header", { name: "New habit" })).toBeTruthy();
  });

  it.each([
    ["sign-in", SignInScreen, "Sign in"],
    ["sign-up", SignUpScreen, "Create account"],
  ])("marks the %s title as a heading", (_, Screen, title) => {
    const { getByRole } = withWrapper(<Screen />);

    expect(getByRole("header", { name: title })).toBeTruthy();
  });

  it("marks the join-group title as a heading", () => {
    const { getByRole } = withWrapper(<JoinGroupScreen />);

    expect(getByRole("header", { name: "Join a crew." })).toBeTruthy();
  });
});

describe("Auth screens", () => {
  it("announces the welcome buttons as buttons", () => {
    const { getByRole } = render(<WelcomeScreen />);

    expect(getByRole("button", { name: "Create account" })).toBeTruthy();
    expect(getByRole("button", { name: "I have an account" })).toBeTruthy();
  });

  it("announces the switch to sign-up as a link", () => {
    const { getByRole } = withWrapper(<SignInScreen />);

    expect(getByRole("link", { name: "Sign up" })).toBeTruthy();
  });

  it("announces the switch to sign-in as a link", () => {
    const { getByRole } = withWrapper(<SignUpScreen />);

    expect(getByRole("link", { name: "Sign in" })).toBeTruthy();
  });
});

// WCAG 1.4.3: 4.5:1 for normal-size text. `text-dim` carries placeholders,
// helper lines and ticked habits, so it has to clear that on both grounds.
describe("Text contrast", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each([
    ["background", themeColors.background],
    ["surface", themeColors.surface],
  ])("text-dim reads at 4.5:1 on %s", (_, ground) => {
    expect(contrast(themeColors.textDim, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it("matches the Tailwind token", () => {
    const tailwind = require("../../tailwind.config.js");
    expect(tailwind.theme.extend.colors["text-dim"]).toBe(themeColors.textDim);
  });
});
