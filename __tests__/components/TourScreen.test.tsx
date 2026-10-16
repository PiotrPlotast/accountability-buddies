import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import TourScreen from "@/app/(protected)/tour";
import { queryKeys } from "@/lib/queryKeys";
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
    full_name: "Ada",
    avatar_url: null,
    tour_seen_at: tourSeenAt,
  };
  const qb = makeQueryBuilder({ data: profile, error: null });
  const fromImpl = jest.fn(() => qb);
  const supabase = buildFakeSupabase({ fromImpl });
  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.profile("user-1"), profile);
  const { Wrapper } = buildWrapper({ supabase, queryClient });
  return { qb, Wrapper };
}

const FIRST_RUN = null;
const REPLAY = "2026-10-01T10:00:00Z";

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe("TourScreen", () => {
  it("opens on the first slide with a way to skip", () => {
    const { Wrapper } = setup(FIRST_RUN);
    const { getByText, getByRole } = render(<TourScreen />, {
      wrapper: Wrapper,
    });

    expect(getByText(TOUR_SLIDES[0].title)).toBeTruthy();
    expect(getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(getByText(`1 of ${TOUR_SLIDES.length}`)).toBeTruthy();
  });

  it("marks every slide title as a heading for VoiceOver", () => {
    const { Wrapper } = setup(FIRST_RUN);
    const { getAllByRole } = render(<TourScreen />, { wrapper: Wrapper });

    expect(getAllByRole("header").map((h) => h.props.children)).toEqual(
      TOUR_SLIDES.map((s) => s.title),
    );
  });

  it("steps through every slide with Next and ends on Let's go", () => {
    const { Wrapper } = setup(FIRST_RUN);
    const { getByRole, getByText, queryByRole } = render(<TourScreen />, {
      wrapper: Wrapper,
    });

    for (let i = 1; i < TOUR_SLIDES.length; i++) {
      fireEvent.press(getByRole("button", { name: "Next" }));
      expect(getByText(`${i + 1} of ${TOUR_SLIDES.length}`)).toBeTruthy();
    }

    expect(queryByRole("button", { name: "Next" })).toBeNull();
    expect(queryByRole("button", { name: "Skip" })).toBeNull();
    expect(getByRole("button", { name: "Let's go" })).toBeTruthy();
  });

  it("finishing on first run records it and moves on into the app", async () => {
    const { qb, Wrapper } = setup(FIRST_RUN);
    const { getByRole } = render(<TourScreen />, { wrapper: Wrapper });

    for (let i = 1; i < TOUR_SLIDES.length; i++) {
      fireEvent.press(getByRole("button", { name: "Next" }));
    }
    fireEvent.press(getByRole("button", { name: "Let's go" }));

    expect(router.replace).toHaveBeenCalledWith("/");
    expect(router.back).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(qb.update).toHaveBeenCalledWith({
        tour_seen_at: expect.any(String),
      });
    });
  });

  it("skipping on first run counts as seen", async () => {
    const { qb, Wrapper } = setup(FIRST_RUN);
    const { getByRole } = render(<TourScreen />, { wrapper: Wrapper });

    fireEvent.press(getByRole("button", { name: "Skip" }));

    expect(router.replace).toHaveBeenCalledWith("/");
    await waitFor(() => expect(qb.update).toHaveBeenCalled());
  });

  it("a replay from settings just closes, and writes nothing", () => {
    const { qb, Wrapper } = setup(REPLAY);
    const { getByRole } = render(<TourScreen />, { wrapper: Wrapper });

    fireEvent.press(getByRole("button", { name: "Skip" }));

    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(qb.update).not.toHaveBeenCalled();
  });
});
