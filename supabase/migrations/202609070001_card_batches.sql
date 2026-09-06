-- Which cards the club has already printed.
--
-- The QR page held its batch in the browser and nowhere else: a reload wiped it, and the
-- only record of a run was the sheet someone had already sent to the printer. Nothing
-- said which numbers were out, so the next batch started at 1 again and the club ended
-- up with two cards called MJ-001.
--
-- A batch is stored as what it was asked for — prefix, first number, how many — because
-- the codes follow from those three and nothing else. The page rebuilds the QR images
-- from them whenever an admin opens an old run.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

create table if not exists public.card_batches (
  id uuid primary key default gen_random_uuid(),
  prefix text not null,
  start_number integer not null,
  count integer not null,
  created_at timestamptz not null default now()
);

create index if not exists card_batches_created_at_idx
  on public.card_batches (created_at desc);

alter table public.card_batches enable row level security;

-- Printed cards are the club's own bookkeeping: an admin signed into the panel reads and
-- writes them, and nobody else sees them at all.
drop policy if exists "authenticated card batches read" on public.card_batches;
create policy "authenticated card batches read"
on public.card_batches for select to authenticated using (true);

drop policy if exists "authenticated card batches write" on public.card_batches;
create policy "authenticated card batches write"
on public.card_batches for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.card_batches to authenticated, service_role;
