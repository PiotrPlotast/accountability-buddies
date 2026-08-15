import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, waitFor } from "@testing-library/react-native";
import { useContext } from "react";

import { ThemeProvider } from "@/providers/theme-provider";
import { ThemeContext } from "@/context/theme-context";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// jest.setup.js stubs `useTheme` globally, so read the real context directly.
function Probe() {
  const ctx = useContext(ThemeContext);
  return (
    <Text testID="probe">{`${ctx?.accentId}:${ctx?.hydrated ? "ready" : "waiting"}`}</Text>
  );
}

const renderProvider = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

describe("ThemeProvider hydration", () => {
  afterEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockReset?.();
  });

  it("starts un-hydrated so the splash can wait for the stored accent", () => {
    (AsyncStorage.getItem as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { getByTestId } = renderProvider();
    expect(getByTestId("probe").props.children).toBe("neon:waiting");
  });

  it("adopts the stored accent before reporting hydrated", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("purple");
    const { getByTestId } = renderProvider();

    await waitFor(() =>
      expect(getByTestId("probe").props.children).toBe("purple:ready"),
    );
  });

  it("hydrates on the default when nothing is stored", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const { getByTestId } = renderProvider();

    await waitFor(() =>
      expect(getByTestId("probe").props.children).toBe("neon:ready"),
    );
  });

  it("ignores a stored value that is no longer a real accent", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("chartreuse");
    const { getByTestId } = renderProvider();

    await waitFor(() =>
      expect(getByTestId("probe").props.children).toBe("neon:ready"),
    );
  });

  // A failed read must not strand the app on the splash screen.
  it("still hydrates when the read rejects", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error("nope"));
    const { getByTestId } = renderProvider();

    await waitFor(() =>
      expect(getByTestId("probe").props.children).toBe("neon:ready"),
    );
  });
});
