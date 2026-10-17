import "../../global.css";
import Tour from "@/app/components/tour/Tour";

/** The first-run tour, mounted by the tour gate in `_layout.tsx`. */
export default function TourScreen() {
  return <Tour mode="firstRun" />;
}
