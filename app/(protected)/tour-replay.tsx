import "../../global.css";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Tour from "@/app/components/tour/Tour";

/**
 * The tour again, pushed from settings. It is presented as a native modal,
 * and the demos' habit rows swipe, so it brings its own gesture root rather
 * than relying on the layout's reaching into the modal (a nested root is a
 * no-op where it does).
 */
export default function TourReplayScreen() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Tour mode="replay" />
    </GestureHandlerRootView>
  );
}
