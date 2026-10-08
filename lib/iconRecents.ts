import AsyncStorage from "@react-native-async-storage/async-storage";

import { GROUP_ICON_CHOICES, ICON_CHOICES } from "@/lib/habitIcons";

/**
 * The quick-pick row above the full emoji picker is this phone's most recently
 * picked emoji, seeded from the curated sets. It is per device, like the
 * accent: a convenience, not something worth a column. Habits and groups keep
 * separate rows because a group is a crew, not a habit.
 *
 * Only a pick from the full picker moves the row. Tapping a tile that's
 * already there selects it in place — a row that reorders under your finger
 * reads as a misfire.
 */
export type IconKind = "habit" | "group";

const DEFAULTS: Record<IconKind, string[]> = {
  habit: ICON_CHOICES,
  group: GROUP_ICON_CHOICES,
};

const storageKey = (kind: IconKind) => `icons.recent.${kind}.v1`;

export function defaultIconRecents(kind: IconKind): string[] {
  return DEFAULTS[kind];
}

// Front of the row, de-duplicated, the oldest dropped to keep its length.
export function pushIconRecent(
  row: string[],
  emoji: string,
  max = row.length,
): string[] {
  return [emoji, ...row.filter((e) => e !== emoji)].slice(0, max);
}

// The current icon is always visible, even once it has dropped off this
// phone's row or was picked on another phone.
export function withSelectedIcon(row: string[], selected: string | null) {
  return selected && !row.includes(selected) ? [selected, ...row] : row;
}

const isRow = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((e) => typeof e === "string");

// Never throws: anything unreadable means the defaults.
export async function loadIconRecents(kind: IconKind): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(storageKey(kind));
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isRow(parsed)) return parsed;
    }
  } catch {
    // Fall through to the defaults.
  }
  return DEFAULTS[kind];
}

export async function saveIconRecents(
  kind: IconKind,
  row: string[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(kind), JSON.stringify(row));
  } catch {
    // A lost row is a nuisance, not an error worth surfacing.
  }
}
