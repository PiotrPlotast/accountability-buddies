/**
 * The one definition of a display name.
 *
 * `profiles.full_name` is the single name column — `nickname` was dropped in
 * E2 PR 1 — and everything that reads, writes or gates on it goes through
 * here, so the value stored by the name screen and the value the gate tests
 * can never disagree about what counts as "named".
 */

/**
 * Long enough for a full name in any script, short enough that a member tab
 * doesn't have to truncate. Names are per-group and among friends; this is a
 * sanity bound, not a policy.
 */
export const MAX_NAME_LENGTH = 32;

/** Trim the ends and collapse inner whitespace runs to a single space. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Whether typed input is savable: non-empty and within the cap once
 * normalized. Length is measured after trimming, so trailing spaces from a
 * keyboard's autocomplete can't push a legal name over the limit.
 */
export function isValidName(raw: string): boolean {
  const name = normalizeName(raw);
  return name.length > 0 && name.length <= MAX_NAME_LENGTH;
}

/**
 * Whether a profile row already carries a name. A missing row counts as
 * unnamed: the signup trigger creates it, so "not there yet" and "there but
 * blank" are the same state as far as the gate is concerned.
 */
export function hasDisplayName(
  profile: { full_name: string | null } | null | undefined,
): boolean {
  return !!profile?.full_name?.trim();
}
