import Svg, { Path } from "react-native-svg";

type Props = {
  color: string;
  size?: number;
};

/**
 * A pencil, drawn rather than typed.
 *
 * The obvious alternative is the "✎" character, but it has no glyph in Geist
 * Mono and falls back per platform — a thin outline on iOS, tofu on some
 * Android fonts. `react-native-svg` is already here for `ProgressRing`, so the
 * shape costs nothing and takes the accent colour exactly.
 */
export default function PencilIcon({ color, size = 15 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m15 5 4 4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
