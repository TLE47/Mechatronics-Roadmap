-- The first account table: one progress snapshot per learner.
--
-- Kept as its own migration so a project that already followed `docs/ACCOUNTS.md` by hand can run
-- this file without touching the data it has. Everything is `if not exists` / `drop policy if exists`
-- for the same reason: the SQL editor is a place people paste twice.
--
-- Supabase grants `all` on new public tables to `anon` and `authenticated` by default. Policies do not
-- take a privilege away, so each table here revokes first and grants back only the verbs it needs. The
-- browser gets no `delete` on progress: an account-wide delete goes through `account-action`, where the
-- caller's identity and the typed confirmation are both checked.

create table if not exists public.mechalab_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.mechalab_progress enable row level security;
alter table public.mechalab_progress force row level security;

revoke all on table public.mechalab_progress from anon, authenticated;
grant select, insert, update on table public.mechalab_progress to authenticated;

drop policy if exists "read own progress" on public.mechalab_progress;
create policy "read own progress" on public.mechalab_progress
  for select using (auth.uid() = user_id);

drop policy if exists "insert own progress" on public.mechalab_progress;
create policy "insert own progress" on public.mechalab_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own progress" on public.mechalab_progress;
create policy "update own progress" on public.mechalab_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
