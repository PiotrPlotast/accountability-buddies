import { Appearance, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, waitFor } from "@testing-library/react-native";
import { useContext } from "react";

import { ThemeProvider } from "@/providers/theme-provider";
import { ThemeContext, ThemeContextValue } from "@/context/theme-context";
import { accentsFor } from "@/lib/accents";
import { schemeColors } from "@/lib/colors";
import { isHapticsEnabled, setHapticsEnabled } from "@/lib/haptics";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// The phone's appearance. `useColorScheme` imports `Appearance` directly, so a
// spy on the `react-native` export never reaches it; stub the hook instead.
let mockSystemScheme: "light" | "dark" | null = "light";
const mockSchemeListeners = new Set<() => void>();
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => {
  const { useSyncExternalStore } = require("react");
  const useColorScheme = () =>
    useSyncExternalStore(
      (onChange: () => void) => {
        mockSchemeListeners.add(onChange);
        return () => mockSchemeListeners.delete(onChange);
      },
      () => mockSystemScheme,
    );
  return { __esModule: true, default: useColorScheme };
});

const setSystemScheme = (scheme: "light" | "dark") => {
  mockSystemScheme = scheme;
  mockSchemeListeners.forEach((fn) => fn());
};

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
  // A plain function, not an assignment in the component body: reassigning an
  // outer variable during render is what the React Compiler rules flag.
  const capture = (value: ThemeContextValue | null) => {
    ctx = value;
  };

  function HapticsProbe() {
    const value = useContext(ThemeContext);
    capture(value);
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

// System / Light / Dark is a per-device choice like the accent. "System"
// follows the phone live; the explicit two are also handed to `Appearance` so
// the native pieces the app doesn't draw (time pickers, alerts, sheets, the
// keyboard) match the screens around them.
describe("ThemeProvider colour mode", () => {
  let ctx: ThemeContextValue | null = null;
  const capture = (value: ThemeContextValue | null) => {
    ctx = value;
  };

  function ModeProbe() {
    const value = useContext(ThemeContext);
    capture(value);
    return (
      <Text testID="mode">{`${value?.colorMode}:${value?.scheme}:${value?.hydrated ? "ready" : "waiting"}`}</Text>
    );
  }

  const renderIt = () =>
    render(
      <ThemeProvider>
        <ModeProbe />
      </ThemeProvider>,
    );

  const storeMode = (mode: string | null) =>
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === "theme.mode.v1" ? mode : null),
    );

  beforeEach(() => {
    ctx = null;
    mockSystemScheme = "light";
    jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => {});
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockReset?.();
    (AsyncStorage.setItem as jest.Mock).mockReset?.();
  });

  it("follows the phone when nothing is stored", async () => {
    storeMode(null);
    const { getByTestId } = renderIt();

    await waitFor(() =>
      expect(getByTestId("mode").props.children).toBe("system:light:ready"),
    );
    expect(ctx?.colors).toEqual(schemeColors.light);
  });

  it("hands out the light shade of the chosen accent in light mode", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === "theme.mode.v1"
          ? "light"
          : key === "theme.accent.v1"
            ? "teal"
            : null,
      ),
    );
    renderIt();

    await waitFor(() => expect(ctx?.hydrated).toBe(true));
    const teal = accentsFor("light").find((a) => a.id === "teal");
    expect(ctx?.accent).toEqual(teal);
    expect(ctx?.palette).toEqual(accentsFor("light"));
  });

  it("restores a stored Dark over a light phone, and tells Appearance", async () => {
    storeMode("dark");
    const { getByTestId } = renderIt();

    await waitFor(() =>
      expect(getByTestId("mode").props.children).toBe("dark:dark:ready"),
    );
    expect(ctx?.colors).toEqual(schemeColors.dark);
    expect(Appearance.setColorScheme).toHaveBeenCalledWith("dark");
  });

  // Hydrating on System must not pin the phone's answer as an override.
  it("leaves Appearance alone when hydrating on System", async () => {
    storeMode("system");
    renderIt();

    await waitFor(() => expect(ctx?.hydrated).toBe(true));
    expect(Appearance.setColorScheme).not.toHaveBeenCalled();
  });

  it("ignores a stored value that is not a mode", async () => {
    storeMode("sepia");
    const { getByTestId } = renderIt();

    await waitFor(() =>
      expect(getByTestId("mode").props.children).toBe("system:light:ready"),
    );
  });

  it("still hydrates, following the phone, when the read rejects", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error("nope"));
    const { getByTestId } = renderIt();

    await waitFor(() =>
      expect(getByTestId("mode").props.children).toBe("system:light:ready"),
    );
  });

  it("switches, stores the choice and tells Appearance", async () => {
    storeMode(null);
    const { getByTestId } = renderIt();
    await waitFor(() => expect(ctx?.hydrated).toBe(true));

    await act(async () => {
      ctx?.setColorMode("dark");
    });

    expect(getByTestId("mode").props.children).toBe("dark:dark:ready");
    expect(ctx?.colors).toEqual(schemeColors.dark);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("theme.mode.v1", "dark");
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith("dark");
  });

  // RN 0.82+ takes "unspecified", not null, to drop an override.
  it("hands control back to the phone on System", async () => {
    storeMode("dark");
    const { getByTestId } = renderIt();
    await waitFor(() => expect(ctx?.hydrated).toBe(true));

    await act(async () => {
      ctx?.setColorMode("system");
    });

    expect(getByTestId("mode").props.children).toBe("system:light:ready");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "theme.mode.v1",
      "system",
    );
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith("unspecified");
  });

  it("changes with the phone while on System", async () => {
    storeMode(null);
    const { getByTestId } = renderIt();
    await waitFor(() => expect(ctx?.hydrated).toBe(true));

    act(() => setSystemScheme("dark"));

    expect(getByTestId("mode").props.children).toBe("system:dark:ready");
  });

  it("stays put when the phone changes under an explicit Light", async () => {
    storeMode("light");
    const { getByTestId } = renderIt();
    await waitFor(() => expect(ctx?.hydrated).toBe(true));

    act(() => setSystemScheme("dark"));

    expect(getByTestId("mode").props.children).toBe("light:light:ready");
  });

  // Before the choice is read the splash is still up; what matters is that
  // the first frame after it is already in the right scheme.
  it("waits for the stored mode before reporting hydrated", () => {
    (AsyncStorage.getItem as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { getByTestId } = renderIt();

    expect(getByTestId("mode").props.children).toBe("system:light:waiting");
  });
});
