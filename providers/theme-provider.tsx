import { ReactNode, useEffect, useMemo, useState } from "react";
import { Appearance, useColorScheme, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { vars } from "nativewind";

import { AccentId, ThemeContext } from "@/context/theme-context";
import { accentsFor, isAccentId } from "@/lib/accents";
import {
  ColorMode,
  cssVariables,
  isColorMode,
  resolveColorScheme,
  schemeColors,
} from "@/lib/colors";
import { setHapticsEnabled as syncHaptics } from "@/lib/haptics";

const STORAGE_KEY = "theme.accent.v1";
const HAPTICS_KEY = "theme.haptics.v1";
const MODE_KEY = "theme.mode.v1";

// The native pieces the app doesn't draw — time pickers, alerts, sheets, the
// keyboard — follow `Appearance`, not this provider. An explicit choice is
// handed over as an override; System drops it ("unspecified" from RN 0.82,
// where `null` no longer clears it) so they follow the phone again.
const applyToNative = (mode: ColorMode) =>
  Appearance.setColorScheme(mode === "system" ? "unspecified" : mode);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [accentId, setAccentIdState] = useState<AccentId>("neon");
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);
  const [colorMode, setColorModeState] = useState<ColorMode>("system");
  // Under an override this reports the override, which is fine: `system` is
  // the only mode that reads it, and System clears the override.
  const systemScheme = useColorScheme();
  // The stored accent and mode arrive a frame or two after mount, so anything
  // painted before then uses the defaults. `_layout` holds the splash until
  // this flips, otherwise a user who picked purple watches the app open green.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(HAPTICS_KEY),
      AsyncStorage.getItem(MODE_KEY),
    ])
      .then(([storedAccent, storedHaptics, storedMode]) => {
        if (storedAccent && isAccentId(storedAccent))
          setAccentIdState(storedAccent);
        // Only an explicit "false" turns haptics off. Anything else — nothing
        // stored, a value from a future version — leaves them on, which is the
        // safe direction: a lost preference is a nuisance, a silently dead
        // Taptic Engine reads as a broken app.
        const on = storedHaptics !== "false";
        setHapticsEnabledState(on);
        syncHaptics(on);
        // System is the default and needs no override, so only an explicit
        // choice is handed to the native side.
        if (storedMode && isColorMode(storedMode) && storedMode !== "system") {
          setColorModeState(storedMode);
          applyToNative(storedMode);
        }
      })
      // A failed read just means the defaults — never a stuck splash.
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const setAccent = (id: AccentId) => {
    setAccentIdState(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  };

  // The module flag is what every call site reads, so it moves first and
  // without waiting on storage — the next tap has to be silent already.
  const setHapticsEnabled = (on: boolean) => {
    syncHaptics(on);
    setHapticsEnabledState(on);
    AsyncStorage.setItem(HAPTICS_KEY, String(on)).catch(() => {});
  };

  const setColorMode = (mode: ColorMode) => {
    setColorModeState(mode);
    applyToNative(mode);
    AsyncStorage.setItem(MODE_KEY, mode).catch(() => {});
  };

  const scheme = resolveColorScheme(colorMode, systemScheme);
  const colors = schemeColors[scheme];
  const palette = accentsFor(scheme);

  const accent = useMemo(
    () => palette.find((p) => p.id === accentId) ?? palette[0],
    [palette, accentId],
  );

  const value = useMemo(
    () => ({
      accentId,
      accent,
      setAccent,
      palette,
      hapticsEnabled,
      setHapticsEnabled,
      colorMode,
      setColorMode,
      scheme,
      colors,
      hydrated,
    }),
    [
      accentId,
      accent,
      palette,
      hapticsEnabled,
      colorMode,
      scheme,
      colors,
      hydrated,
    ],
  );

  // NativeWind's tokens are CSS variables; setting them here is what moves
  // every class below — modals included, since they inherit through React.
  const variables = useMemo(() => vars(cssVariables(colors)), [colors]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, variables]}>{children}</View>
    </ThemeContext.Provider>
  );
};
