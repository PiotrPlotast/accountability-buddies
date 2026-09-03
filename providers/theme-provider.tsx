import { ReactNode, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Accent, AccentId, ThemeContext } from "@/context/theme-context";
import { setHapticsEnabled as syncHaptics } from "@/lib/haptics";

const STORAGE_KEY = "theme.accent.v1";
const HAPTICS_KEY = "theme.haptics.v1";

const PALETTE: Accent[] = [
  {
    id: "neon",
    hex: "#C6F94A",
    dim: "#8FB732",
    shades: ["#1E1E21", "#3A5F10", "#6E9E22", "#C6F94A"],
  },
  {
    id: "blue",
    hex: "#4AB8F9",
    dim: "#2E7AB7",
    shades: ["#1E1E21", "#103040", "#1F6F9E", "#4AB8F9"],
  },
  {
    id: "purple",
    hex: "#B45EFF",
    dim: "#7E3FB3",
    shades: ["#1E1E21", "#3A1F4F", "#7E3FB3", "#B45EFF"],
  },
  {
    id: "orange",
    hex: "#FF8A3D",
    dim: "#B85F25",
    shades: ["#1E1E21", "#4F2A11", "#B85F25", "#FF8A3D"],
  },
  {
    id: "pink",
    hex: "#FF5E9C",
    dim: "#B73F70",
    shades: ["#1E1E21", "#4F1E33", "#B73F70", "#FF5E9C"],
  },
  {
    id: "teal",
    hex: "#3DD9C5",
    dim: "#1F8E80",
    shades: ["#1E1E21", "#103E38", "#1F8E80", "#3DD9C5"],
  },
];

const isAccentId = (s: string): s is AccentId =>
  PALETTE.some((p) => p.id === s);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [accentId, setAccentIdState] = useState<AccentId>("neon");
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);
  // The stored accent arrives a frame or two after mount, so anything painted
  // before then uses the default. `_layout` holds the splash until this flips,
  // otherwise a user who picked purple watches the app open green.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(HAPTICS_KEY),
    ])
      .then(([storedAccent, storedHaptics]) => {
        if (storedAccent && isAccentId(storedAccent))
          setAccentIdState(storedAccent);
        // Only an explicit "false" turns haptics off. Anything else — nothing
        // stored, a value from a future version — leaves them on, which is the
        // safe direction: a lost preference is a nuisance, a silently dead
        // Taptic Engine reads as a broken app.
        const on = storedHaptics !== "false";
        setHapticsEnabledState(on);
        syncHaptics(on);
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

  const accent = useMemo(
    () => PALETTE.find((p) => p.id === accentId) ?? PALETTE[0],
    [accentId],
  );

  const value = useMemo(
    () => ({
      accentId,
      accent,
      setAccent,
      palette: PALETTE,
      hapticsEnabled,
      setHapticsEnabled,
      hydrated,
    }),
    [accentId, accent, hapticsEnabled, hydrated],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
