-- E6: the first-run walkthrough is shown once per account.
--
-- `tour_seen_at` is null until the person finishes or skips the tour. Every
-- account that already exists is marked as having seen it, so only people who
-- sign up after this ships are walked through the app. The client writes it
-- through the existing "Users update own profile" policy.
alter table public.profiles
  add column if not exists tour_seen_at timestamptz;

update public.profiles
   set tour_seen_at = now()
 where tour_seen_at is null;
