import { act, render } from "@testing-library/react-native";
import type { TestInstance } from "test-renderer";

import Heatmap from "@/app/components/profile/Heatmap";
import { getRecentLocalDates } from "@/lib/date";

const mockUseHeatmapData = jest.fn();
jest.mock("@/hooks/useHeatmapData", () => ({
  useHeatmapData: (userId?: string) => mockUseHeatmapData(userId),
}));

const WEEKS = 12;
const DAYS = 7;
const TOTAL_CELLS = WEEKS * DAYS;

// Each day cell is a leaf <View /> carrying the 4px corner radius.
const countCells = (container: TestInstance) =>
  container.queryAll(
    (n) =>
      n.type === "View" &&
      typeof n.props.style === "object" &&
      n.props.style?.borderRadius === 4,
  ).length;

beforeEach(() => {
  mockUseHeatmapData.mockReturnValue({ data: {}, isLoading: false });
});

describe("Heatmap", () => {
  it("renders a cell for every day in the window", async () => {
    const { container } = await render(<Heatmap userId="user-1" />);
    expect(countCells(container)).toBe(TOTAL_CELLS);
  });

  it("draws no cells while loading", async () => {
    mockUseHeatmapData.mockReturnValue({ data: undefined, isLoading: true });
    const { container, getByLabelText } = await render(
      <Heatmap userId="user-1" />,
    );

    expect(countCells(container)).toBe(0);
    expect(getByLabelText("Loading activity")).toBeTruthy();
  });

  it("passes the user through to the query", async () => {
    await render(<Heatmap userId="user-9" />);
    expect(mockUseHeatmapData).toHaveBeenCalledWith("user-9");
  });

  describe("accessibility", () => {
    // 84 unlabelled cells are useless to step through one at a time, so the
    // grid is a single element summarising the window.
    it("summarises the window instead of exposing every cell", async () => {
      const dates = getRecentLocalDates(TOTAL_CELLS);
      mockUseHeatmapData.mockReturnValue({
        data: { [dates[0]]: 2, [dates[5]]: 1, [dates[TOTAL_CELLS - 1]]: 3 },
        isLoading: false,
      });

      const { getByLabelText } = await render(<Heatmap userId="user-1" />);
      expect(
        getByLabelText(
          `Activity over the last ${WEEKS} weeks: 6 check-ins across 3 of ${TOTAL_CELLS} days.`,
        ),
      ).toBeTruthy();
    });

    it("reports an empty window honestly", async () => {
      const { getByLabelText } = await render(<Heatmap userId="user-1" />);
      expect(
        getByLabelText(
          `Activity over the last ${WEEKS} weeks: 0 check-ins across 0 of ${TOTAL_CELLS} days.`,
        ),
      ).toBeTruthy();
    });

    it("ignores dates outside the window when summarising", async () => {
      mockUseHeatmapData.mockReturnValue({
        data: { "2000-01-01": 5 },
        isLoading: false,
      });

      const { getByLabelText } = await render(<Heatmap userId="user-1" />);
      expect(
        getByLabelText(
          `Activity over the last ${WEEKS} weeks: 0 check-ins across 0 of ${TOTAL_CELLS} days.`,
        ),
      ).toBeTruthy();
    });
  });

  describe("after midnight", () => {
    afterEach(() => jest.useRealTimers());

    const summary = (total: number, days: number) =>
      `Activity over the last ${WEEKS} weeks: ${total} check-ins across ${days} of ${TOTAL_CELLS} days.`;

    // The Profile tab stays mounted, so the grid has to move on its own:
    // a check-in made after midnight is stored under the new date.
    it("moves the window forward when the day changes while mounted", async () => {
      jest.useFakeTimers({ now: new Date(2026, 9, 5, 23, 59, 0) });
      mockUseHeatmapData.mockReturnValue({
        data: { "2026-10-06": 3 },
        isLoading: false,
      });

      const { getByLabelText } = await render(<Heatmap userId="user-1" />);
      expect(getByLabelText(summary(0, 0))).toBeTruthy();

      await act(() => jest.advanceTimersByTime(60_000));
      expect(getByLabelText(summary(3, 1))).toBeTruthy();
    });

    it("drops the oldest day once the window moves", async () => {
      jest.useFakeTimers({ now: new Date(2026, 9, 5, 23, 59, 0) });
      const oldest = getRecentLocalDates(TOTAL_CELLS)[0];
      mockUseHeatmapData.mockReturnValue({
        data: { [oldest]: 2 },
        isLoading: false,
      });

      const { getByLabelText } = await render(<Heatmap userId="user-1" />);
      expect(getByLabelText(summary(2, 1))).toBeTruthy();

      await act(() => jest.advanceTimersByTime(60_000));
      expect(getByLabelText(summary(0, 0))).toBeTruthy();
    });
  });
});
