// A stand-in for gesture-handler's ReanimatedSwipeable, for the suites that
// drive a habit row's swipe:
//
//   jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () =>
//     require("../test-utils/swipeableStub"),
//   );
//
// A real swipe can't run under Jest: the actions behind a row stay
// `pointerEvents: "none"` until the gesture opens it, and Reanimated's mock
// never re-evaluates that. RNTL 14 only renders native elements, so the
// render functions can't be read off the component either. This stand-in
// draws each row's actions as they look once swiped open, so a test presses
// "Nudge" or "Delete" by its label, and hands the drag callbacks to the row
// as events a test fires the way the gesture would:
//
//   await fireEvent(row, "swipeableOpenStartDrag", "right");
//
// `swipeableClose` records the row being closed by an action.
import { ReactNode } from "react";
import { View } from "react-native";

export const swipeableClose = jest.fn();

type Render = (progress: unknown, drag: unknown, methods: unknown) => ReactNode;

type Props = {
  children?: ReactNode;
  renderLeftActions?: Render;
  renderRightActions?: Render;
  onSwipeableOpenStartDrag?: (direction: "left" | "right") => void;
  onSwipeableCloseStartDrag?: (direction: "left" | "right") => void;
};

function Swipeable({
  children,
  renderLeftActions,
  renderRightActions,
  onSwipeableOpenStartDrag,
  onSwipeableCloseStartDrag,
}: Props) {
  const progress = { value: 1 };
  const drag = { value: 0 };
  const methods = {
    close: swipeableClose,
    openLeft: jest.fn(),
    openRight: jest.fn(),
    reset: jest.fn(),
  };
  // Not View props: carried on the host so RNTL's `fireEvent` finds them.
  const dragEvents = { onSwipeableOpenStartDrag, onSwipeableCloseStartDrag };
  return (
    <View testID="swipeable-row" {...(dragEvents as object)}>
      {renderLeftActions ? (
        <View testID="swipe-left-actions">
          {renderLeftActions(progress, drag, methods)}
        </View>
      ) : null}
      {children}
      {renderRightActions ? (
        <View testID="swipe-right-actions">
          {renderRightActions(progress, drag, methods)}
        </View>
      ) : null}
    </View>
  );
}

export default Swipeable;
