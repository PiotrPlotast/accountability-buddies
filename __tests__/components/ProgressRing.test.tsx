import { render } from "@testing-library/react-native";

import ProgressRing from "@/app/components/dashboard/ProgressRing";

describe("ProgressRing", () => {
  it("renders the rounded percentage", () => {
    const { getByText } = render(<ProgressRing progress={0.42} />);
    expect(getByText("42%")).toBeTruthy();
  });

  it("clamps progress above 1 to 100%", () => {
    const { getByText } = render(<ProgressRing progress={1.7} />);
    expect(getByText("100%")).toBeTruthy();
  });

  it("clamps negative progress to 0%", () => {
    const { getByText } = render(<ProgressRing progress={-0.5} />);
    expect(getByText("0%")).toBeTruthy();
  });
});
