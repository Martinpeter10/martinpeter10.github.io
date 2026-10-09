-- GENERATED FROM 0008_rename.sql - DO NOT EDIT BY HAND.
-- Target schema: app_dev
-- Regenerate with ./generate.sh after changing the template.

-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - let a player change their username. Template; app_dev must be
-- substituted. ./generate.sh
--
-- Same shape rule, same moderation, same uniqueness as a first claim - the
-- rename action in the username Edge Function reuses moderate() rather than
-- reimplementing it, so there is one filter and one place to change it.
--
-- `profiles.renamed_at` already existed from 0001 for this purpose. The
-- cooldown is enforced in the UPDATE's WHERE clause, not by reading then
-- writing, so two concurrent requests cannot both pass the check.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = app_dev;

-- A rename is exactly the move someone makes to dodge a report, so moderation
-- needs to know who a name used to be.
create table if not exists name_history (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  old_username text not null,
  new_username text not null,
  changed_at   timestamptz not null default now()
);

create index if not exists name_history_user on name_history (user_id, changed_at desc);

alter table name_history enable row level security;

-- Moderation data. No player reads or writes it; only the Edge Function, which
-- holds the secret key.
revoke all on name_history from anon, authenticated;
grant all on name_history to service_role;
grant usage, select on sequence name_history_id_seq to service_role;
