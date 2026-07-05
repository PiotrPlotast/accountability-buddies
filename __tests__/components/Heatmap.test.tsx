import { render } from "@testing-library/react-native";

import Heatmap from "@/app/components/profile/Heatmap";

describe("Heatmap", () => {
  it("renders 7 rows of 13 cells (91 day-cells total)", () => {
    const { UNSAFE_root } = render(<Heatmap seed={1} />);
    // Each cell is a leaf <View /> with backgroundColor + borderRadius.
    type StyledNode = {
      type: string | { displayName?: string };
      props: { style?: { borderRadius?: number } };
    };
    const cells = UNSAFE_root.findAll((n: StyledNode) => {
      const style = n.props.style;
      return (
        n.type === "View" &&
        typeof style === "object" &&
        style?.borderRadius === 4
      );
    });
    expect(cells).toHaveLength(7 * 13);
  });

  it("is deterministic for a given seed", () => {
    const a = render(<Heatmap seed={42} />);
    const b = render(<Heatmap seed={42} />);
    expect(a.toJSON()).toEqual(b.toJSON());
    a.unmount();
    b.unmount();
  });
});
