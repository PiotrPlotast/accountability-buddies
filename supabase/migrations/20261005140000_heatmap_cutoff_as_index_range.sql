-- Let `get_heatmap_logs` seek to its cutoff instead of filtering for it
-- (2026-10-05).
--
-- `logs_user_id_date_idx` holds `date` as text. The old cutoff compared
-- `date::date`, a value the index does not contain, so the plan could only
-- use `user_id` to find someone's entries, then read every check-in they had
-- ever made and discard all but the last 84 days. Comparing the text itself
-- lets the cutoff join the index condition: the scan starts at the first
-- entry inside the window.
--
-- Same rows as before. `YYYY-MM-DD` strings sort in calendar order, and
-- `logs_date_is_iso_date` (20260918120000) guarantees every value has exactly
-- that shape — without it, '2026-9-5' would sort after '2026-10-01'.
-- `current_date - 84` is the same date the old `current_date - interval '84
-- days'` cast back to, so the window, including its UTC basis and its one day
-- of slack over the grid's 84 squares, is unchanged.
--
-- Signature, `security invoker`, `search_path` and grants are all preserved by
-- `create or replace`.

create or replace function public.get_heatmap_logs(p_user_id uuid)
  returns table (log_date text, completed_count integer)
  language sql
  security invoker
  set search_path = ''
as $function$
  select
    date as log_date,
    count(*)::integer as completed_count
  from public.logs
  where user_id = p_user_id
    and date >= to_char(current_date - 84, 'YYYY-MM-DD')
  group by date
  order by date asc;
$function$;
