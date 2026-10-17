/**
 * The server's length limits on what people type, as `maxLength`s. The
 * database enforces them (`goals_title_length`, `groups_name_length`); these
 * stop the box at the same point so a save is never refused for length. A
 * display name's limit is `MAX_NAME_LENGTH` in `lib/displayName.ts`.
 */
export const MAX_HABIT_TITLE_LENGTH = 60;
export const MAX_GROUP_NAME_LENGTH = 40;
