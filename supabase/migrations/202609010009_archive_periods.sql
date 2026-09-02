-- The club's first two seasons ran across two months each (March–April, April–May),
-- so a rating period is not always a calendar month. The archive keeps its own key and
-- title, plus the months a period covers — those months are then hidden from the month
-- picker, because a season and its halves are the same games counted twice.
alter table public.monthly_rating_archive
  drop constraint if exists monthly_rating_archive_month_check;

alter table public.monthly_rating_archive
  add column if not exists label text,
  add column if not exists covered_months text[] not null default '{}',
  add column if not exists sort_key text;

-- Existing rows are plain months: they cover themselves and sort by their own key.
update public.monthly_rating_archive
set covered_months = array[month], sort_key = month
where covered_months = '{}';
