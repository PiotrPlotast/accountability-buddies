-- Habit and group icons can now be any emoji (the app's full emoji picker), so
-- the client no longer limits what lands in these columns. Cap them at 16 code
-- points: every RGI emoji fits (the longest ZWJ and tag sequences are under
-- ten), a sentence does not. `goals.icon` stays nullable — a habit with no
-- icon shows the fallback.

alter table public.goals
  add constraint goals_icon_length check (char_length(icon) <= 16);

alter table public.groups
  add constraint groups_icon_length check (char_length(icon) <= 16);
