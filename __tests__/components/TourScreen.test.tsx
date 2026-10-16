import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import Tour from "@/app/components/tour/Tour";
import * as haptics from "@/lib/haptics";
import { queryKeys } from "@/lib/queryKeys";
import { formatReminderTime } from "@/lib/reminderTime";
import { TOUR_SLIDES } from "@/lib/tour";
import { ProfileRow } from "@/types/dashboardTypes";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryBuilder,
  makeQueryClient,
} from "../test-utils/render";

const router = require("expo-router").__router as {
  replace: jest.Mock;
  back: jest.Mock;
};

function setup(tourSeenAt: string | null) {
  const profile: ProfileRow = {
    full_name: "Piotr",
    avatar_url: null,
    tour_seen_at: tourSeenAt,
  };
  const qb = makeQueryBuilder({ data: profile, error: null });
  const fromImpl = jest.fn(() => qb);
  const invoke = jest.fn();
  const supabase = buildFakeSupabase({ fromImpl, functionsImpl: invoke });
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.profile("user-1"), profile);
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  return { qb, fromImpl, invoke, Wrapper };
}

const FIRST_RUN = null;
const REPLAY = "2026-10-01T10:00:00Z";

function renderTour(mode: "firstRun" | "replay" = "firstRun") {
  const env = setup(mode === "firstRun" ? FIRST_RUN : REPLAY);
  const utils = render(<Tour mode={mode} />, { wrapper: env.Wrapper });
  return { ...utils, ...env };
}

type Utils = ReturnType<typeof renderTour>;

function goToSlide(utils: Utils, id: string) {
  const target = TOUR_SLIDES.findIndex((s) => s.id === id);
  for (let i = 0; i < target; i++) {
    fireEvent.press(utils.getByRole("button", { name: "Next" }));
  }
}

// The swipe reveals a row's action. The gesture can't run here, and a second
// `render` for the action would replace the tour's tree, so the revealed
// action element is asked for and its handler called, as a press would.
function pressSwipeAction(
  utils: Utils,
  rowIndex: number,
  side: "renderLeftActions" | "renderRightActions",
) {
  const row = utils.UNSAFE_getAllByProps({ friction: 2 })[rowIndex];
  const action = (
    row.props[side] as (
      p: unknown,
      d: unknown,
      m: unknown,
    ) => React.ReactElement<{
      goal: unknown;
      onAction: (goal: unknown) => void;
    }>
  )({ value: 0 }, { value: 0 }, { close: jest.fn() });
  act(() => action.props.onAction(action.props.goal));
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.spyOn(haptics, "celebrate").mockImplementation(() => {});
  jest.spyOn(haptics, "toggleDone").mockImplementation(() => {});
  jest.spyOn(haptics, "toggleUndone").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("Tour navigation", () => {
  it("opens on the first slide with a way to skip and no way back", () => {
    const { getByText, getByRole, queryByRole } = renderTour();

    expect(getByRole("header", { name: TOUR_SLIDES[0].title })).toBeTruthy();
    expect(getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(queryByRole("button", { name: "Back" })).toBeNull();
    expect(getByText(`1 of ${TOUR_SLIDES.length}`)).toBeTruthy();
  });

  it("steps through every slide with Next, each title a heading, ending on Let's go", () => {
    const utils = renderTour();

    for (let i = 0; i < TOUR_SLIDES.length; i++) {
      expect(
        utils.getByRole("header", { name: TOUR_SLIDES[i].title }),
      ).toBeTruthy();
      expect(utils.getByText(`${i + 1} of ${TOUR_SLIDES.length}`)).toBeTruthy();
      if (i < TOUR_SLIDES.length - 1) {
        fireEvent.press(utils.getByRole("button", { name: "Next" }));
      }
    }

    expect(utils.queryByRole("button", { name: "Next" })).toBeNull();
    expect(utils.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(utils.getByRole("button", { name: "Let's go" })).toBeTruthy();
  });

  it("goes back a slide", () => {
    const utils = renderTour();
    fireEvent.press(utils.getByRole("button", { name: "Next" }));

    fireEvent.press(utils.getByRole("button", { name: "Back" }));

    expect(
      utils.getByRole("header", { name: TOUR_SLIDES[0].title }),
    ).toBeTruthy();
  });

  it("finishing on first run records it and leaves the move to the layout's guard", async () => {
    // Navigating from here raced the guard: "/" was still guarded off when
    // the replace ran, so the tour stayed on screen. The guard moves on by
    // itself once `needsTour` flips.
    const utils = renderTour();
    goToSlide(utils, TOUR_SLIDES[TOUR_SLIDES.length - 1].id);

    fireEvent.press(utils.getByRole("button", { name: "Let's go" }));

    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(utils.qb.update).toHaveBeenCalledWith({
        tour_seen_at: expect.any(String),
      });
    });
  });

  it("skipping on first run counts as seen", async () => {
    const { getByRole, qb } = renderTour();

    fireEvent.press(getByRole("button", { name: "Skip" }));

    expect(router.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(qb.update).toHaveBeenCalled());
  });

  it("a replay closes from the last slide", () => {
    const utils = renderTour("replay");
    goToSlide(utils, TOUR_SLIDES[TOUR_SLIDES.length - 1].id);

    fireEvent.press(utils.getByRole("button", { name: "Let's go" }));

    expect(router.back).toHaveBeenCalled();
  });

  it("a replay skipped just closes, and writes nothing", () => {
    const { getByRole, qb } = renderTour("replay");

    fireEvent.press(getByRole("button", { name: "Skip" }));

    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(qb.update).not.toHaveBeenCalled();
  });

  it("tells you to try each demo", () => {
    const utils = renderTour();
    for (let i = 0; i < TOUR_SLIDES.length; i++) {
      expect(utils.getByText(TOUR_SLIDES[i].hint)).toBeTruthy();
      if (i < TOUR_SLIDES.length - 1) {
        fireEvent.press(utils.getByRole("button", { name: "Next" }));
      }
    }
  });
});

// NativeWind replaces a Pressable's `style` with its className styles when
// both are set, and a style *function* is dropped outright — so an accent fill
// written as `style={({ pressed }) => ...}` drew a transparent button with
// dark text on the phone: Next and Let's go were invisible but tappable. Jest
// runs without NativeWind, so the guard is on the prop itself.
describe("Tour buttons", () => {
  const ACCENT = "#C6F94A";

  function pressableStyle(utils: Utils, label: string) {
    return utils.UNSAFE_getByProps({ accessibilityLabel: label }).props.style;
  }

  it("fills Next with the accent through a plain style object", () => {
    const utils = renderTour();

    const style = pressableStyle(utils, "Next");

    expect(typeof style).toBe("object");
    expect(style).toEqual(expect.objectContaining({ backgroundColor: ACCENT }));
  });

  it("fills Let's go the same way", () => {
    const utils = renderTour();
    goToSlide(utils, TOUR_SLIDES[TOUR_SLIDES.length - 1].id);

    const style = pressableStyle(utils, "Let's go");

    expect(typeof style).toBe("object");
    expect(style).toEqual(expect.objectContaining({ backgroundColor: ACCENT }));
  });
});

describe("Tour demos", () => {
  it("habits: ticking fills the ring, and the tick that closes the day celebrates", () => {
    const utils = renderTour();
    expect(utils.getByText("0%")).toBeTruthy();

    fireEvent.press(utils.getByLabelText("Read 10 pages"));
    expect(utils.getByText("50%")).toBeTruthy();
    expect(haptics.toggleDone).toHaveBeenCalledTimes(1);
    expect(haptics.celebrate).not.toHaveBeenCalled();

    fireEvent.press(utils.getByLabelText("Go for a run"));
    expect(utils.getByText("100%")).toBeTruthy();
    expect(haptics.celebrate).toHaveBeenCalledTimes(1);

    fireEvent.press(utils.getByLabelText("Go for a run"));
    expect(utils.getByText("50%")).toBeTruthy();
    expect(haptics.toggleUndone).toHaveBeenCalledTimes(1);
  });

  it("manage: swiping a sample habit right opens the real edit sheet", async () => {
    const utils = renderTour();
    goToSlide(utils, "manage");

    pressSwipeAction(utils, 0, "renderLeftActions");
    fireEvent.changeText(
      utils.getByDisplayValue("Read 10 pages"),
      "Read 20 pages",
    );
    fireEvent.press(utils.getByText("Save"));

    await waitFor(() => {
      expect(utils.getByLabelText("Read 20 pages")).toBeTruthy();
    });
  });

  it("manage: swiping a sample habit left deletes it, and the samples come back", async () => {
    const utils = renderTour();
    goToSlide(utils, "manage");

    pressSwipeAction(utils, 1, "renderRightActions");
    // The rows' own swipe actions say "Delete" too; the sheet's is last.
    const deletes = utils.getAllByText("Delete");
    fireEvent.press(deletes[deletes.length - 1]);

    await waitFor(() => {
      expect(utils.queryByLabelText("Go for a run")).toBeNull();
    });

    fireEvent.press(
      utils.getByRole("button", { name: "Bring the samples back" }),
    );
    expect(utils.getByLabelText("Go for a run")).toBeTruthy();
  });

  it("buddies: a buddy's tab shows their day and a nudge you can send", async () => {
    const utils = renderTour();
    goToSlide(utils, "buddies");

    fireEvent.press(utils.getByRole("tab", { name: /^Ada,/ }));
    fireEvent.press(utils.getByRole("button", { name: /Nudge Ada/ }));
    await act(async () => {
      fireEvent.press(utils.getByText("Send"));
    });

    expect(utils.getByText("Nudge sent to Ada")).toBeTruthy();
    expect(utils.invoke).not.toHaveBeenCalled();
  });

  it("buddies: swiping right on their habit prefills a nudge about it", () => {
    const utils = renderTour();
    goToSlide(utils, "buddies");
    fireEvent.press(utils.getByRole("tab", { name: /^Ada,/ }));

    const rows = utils.UNSAFE_getAllByProps({ friction: 2 });
    const openRowIndex = rows.findIndex(
      (r) => r.props.children.props.accessibilityLabel === "Run",
    );
    pressSwipeAction(utils, openRowIndex, "renderRightActions");

    expect(utils.getByLabelText("Nudge message").props.value).toBe(
      "Ada, what about your run?",
    );
  });

  it("reminders: switching a reminder on says when it will come", () => {
    const utils = renderTour();
    goToSlide(utils, "reminders");

    fireEvent(
      utils.getByRole("switch", { name: "Reminder" }),
      "valueChange",
      true,
    );

    expect(
      utils.getByText(
        `We'll remind you at ${formatReminderTime("09:00")} if it isn't ticked by then.`,
      ),
    ).toBeTruthy();
  });

  it("streak: closing the sample day moves the group streak up one", () => {
    const utils = renderTour();
    goToSlide(utils, "streak");
    expect(utils.getByLabelText("Group streak, 4 days")).toBeTruthy();

    fireEvent.press(utils.getByLabelText("Read 10 pages"));
    fireEvent.press(utils.getByLabelText("Go for a run"));

    expect(utils.getByLabelText("Group streak, 5 days")).toBeTruthy();
  });

  it("saves nothing a demo did", async () => {
    const utils = renderTour("replay");
    fireEvent.press(utils.getByLabelText("Read 10 pages"));
    goToSlide(utils, "buddies");
    fireEvent.press(utils.getByRole("tab", { name: /^Ada,/ }));
    fireEvent.press(utils.getByRole("button", { name: /Nudge Ada/ }));
    await act(async () => {
      fireEvent.press(utils.getByText("Send"));
    });

    for (const [table] of utils.fromImpl.mock.calls as unknown as [string][]) {
      expect(table).toBe("profiles");
    }
    expect(utils.qb.insert).not.toHaveBeenCalled();
    expect(utils.qb.update).not.toHaveBeenCalled();
    expect(utils.invoke).not.toHaveBeenCalled();
  });
});
