import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, waitFor } from "@testing-library/react-native";
import { useContext } from "react";

import { ThemeProvider } from "@/providers/theme-provider";
import { ThemeContext, ThemeContextValue } from "@/context/theme-context";
import { isHapticsEnabled, setHapticsEnabled } from "@/lib/haptics";

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

// The haptics flag is mirrored into `lib/haptics`, which is a plain module and
// cannot read the context itself. These tests are about that mirror staying in
// step — the module is the thing every call site actually reads.
describe("ThemeProvider haptics flag", () => {
  let ctx: ThemeContextValue | null = null;

  function HapticsProbe() {
    ctx = useContext(ThemeContext);
    return (
      <Text testID="haptics">{`${ctx?.hapticsEnabled}:${ctx?.hydrated ? "ready" : "waiting"}`}</Text>
    );
  }

  const renderIt = () =>
    render(
      <ThemeProvider>
        <HapticsProbe />
      </ThemeProvider>,
    );

  beforeEach(() => {
    ctx = null;
    setHapticsEnabled(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockReset?.();
    (AsyncStorage.setItem as jest.Mock).mockReset?.();
  });

  it("defaults to enabled when nothing is stored", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const { getByTestId } = renderIt();

    await waitFor(() =>
      expect(getByTestId("haptics").props.children).toBe("true:ready"),
    );
    expect(isHapticsEnabled()).toBe(true);
  });

  it("pushes a stored 'off' into the module on hydration", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === "theme.haptics.v1" ? "false" : null),
    );
    const { getByTestId } = renderIt();

    await waitFor(() =>
      expect(getByTestId("haptics").props.children).toBe("false:ready"),
    );
    expect(isHapticsEnabled()).toBe(false);
  });

  it("writes storage and the module when the switch is flipped", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    const { getByTestId } = renderIt();

    await waitFor(() => expect(ctx?.hydrated).toBe(true));

    await act(async () => {
      ctx?.setHapticsEnabled(false);
    });

    expect(getByTestId("haptics").props.children).toBe("false:ready");
    expect(isHapticsEnabled()).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "theme.haptics.v1",
      "false",
    );
  });

  // Losing the preference is a nuisance; a silent app is a bug report.
  it("leaves haptics on when the read rejects", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error("nope"));
    const { getByTestId } = renderIt();

    await waitFor(() =>
      expect(getByTestId("haptics").props.children).toBe("true:ready"),
    );
    expect(isHapticsEnabled()).toBe(true);
  });
});
