-- GENERATED FROM 0001_init.sql - DO NOT EDIT BY HAND.
-- Target schema: public
-- Regenerate with ./generate.sh after changing the template.

-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm accounts + leaderboards - initial schema
--
-- THIS IS A TEMPLATE, NOT A RUNNABLE FILE. public must be substituted.
-- Do not paste this into the SQL editor - use the generated files beside it:
--
--   0001_init.public.sql    prod project
--   0001_init.app_tst.sql   nonprod project
--   0001_init.app_dev.sql   nonprod project
--
-- Regenerate them after editing this template:
--   ./supabase/migrations/generate.sh
--
-- Why generated rather than hand-edited: a `security definer` function's
-- search_path must be a literal, so it cannot be inherited from the session.
-- A function created in app_tst with `search_path = public` resolves `scores`
-- and `profiles` to the PRODUCTION tables. Substituting the name everywhere
-- mechanically is the only way to be sure that never happens.
--
-- SECURITY MODEL, in one paragraph:
-- The publishable key ships in the browser and can be read by anyone. It is
-- safe ONLY because every table below has RLS enabled with no client-writable
-- policy. Clients never INSERT directly - all writes go through the
-- security-definer functions at the bottom, which pin the date, range-check
-- the score, and enforce one row per player per game per day. Username
-- creation does not even live here: it runs in an Edge Function holding the
-- secret key, so the moderation filter cannot be bypassed by calling the
-- REST API directly.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Schema ────────────────────────────────────────────────────────────────
-- USAGE is the one grant people forget. The `public` schema has it by default;
-- a schema you create does NOT, and without it every API call into app_tst or
-- app_dev fails with a permission error that looks like a missing table.

create schema if not exists public;
grant usage on schema public to anon, authenticated, service_role;

set search_path = public;

-- ── Game registry ─────────────────────────────────────────────────────────
-- Adding a game to the leaderboards is a row here, not a code change.
-- sort_mult: 1 when a higher score is better, -1 when lower is better
-- (Shut the Box scores the tiles left standing, so it is -1).

create table if not exists game_defs (
  game       text primary key,
  label      text not null,
  min_score  int  not null,
  max_score  int  not null,
  sort_mult  int  not null default 1 check (sort_mult in (1, -1))
);

insert into game_defs (game, label, min_score, max_score, sort_mult) values
  ('chainlink', 'Chain Link', 0, 20, 1)
on conflict (game) do nothing;

-- Phase 3 fills in the other nine. Each needs a deliberate decision about
-- what "score" means - the chip games should rank on session net, not stack.
-- Deliberately NOT guessed here.

alter table game_defs enable row level security;

drop policy if exists game_defs_read on game_defs;
create policy game_defs_read on game_defs for select to anon, authenticated using (true);


-- ── Profiles ──────────────────────────────────────────────────────────────
-- username      what the player typed, preserved for display
-- username_key  lower(username), the uniqueness key
--
-- NOTE, changed from the plan: username_key is lowercase only, NOT the fully
-- leet-normalised key. Normalising for uniqueness would collide Peter2 with
-- Peter and reject every legitimate name containing a digit. The aggressive
-- normalisation still runs - it just governs the PROFANITY check, which is
-- where it belongs.

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null,
  username_key text not null unique,
  created_at   timestamptz not null default now(),
  renamed_at   timestamptz,
  constraint username_shape check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  constraint username_key_matches check (username_key = lower(username))
);

alter table profiles enable row level security;

-- A player may read their OWN profile row. There is deliberately no policy
-- allowing a bulk read of every profile: usernames reach other players only
-- through get_leaderboard(), which returns names already joined to scores.
-- That keeps the publishable key from being a user-enumeration tool.
drop policy if exists profiles_read_own on profiles;
create policy profiles_read_own on profiles
  for select to authenticated using (auth.uid() = id);

-- No insert/update/delete policy exists, so with RLS on, clients cannot write
-- here at all. Profile creation happens in the `username` Edge Function.
revoke insert, update, delete on profiles from anon, authenticated;


-- ── Scores ────────────────────────────────────────────────────────────────
-- One row per player per game per day, enforced by the primary key. That is
-- what stops replaying a puzzle until the score is flattering.

create table if not exists scores (
  user_id    uuid not null references auth.users(id) on delete cascade,
  game       text not null references game_defs(game),
  day        date not null,
  score      int  not null,
  detail     jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, game, day)
);

create index if not exists scores_board on scores (game, day, score desc);

alter table scores enable row level security;

drop policy if exists scores_read_own on scores;
create policy scores_read_own on scores
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on scores from anon, authenticated;


-- ── Lifetime stats ────────────────────────────────────────────────────────
-- imported = true marks stats carried over from a player's localStorage.
-- Unverifiable, so it shows on the profile but never on a leaderboard.

create table if not exists game_stats (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game        text not null references game_defs(game),
  played      int not null default 0,
  wins        int not null default 0,
  best        int,
  total_score bigint not null default 0,
  cur_streak  int not null default 0,
  best_streak int not null default 0,
  last_day    date,
  imported    boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, game)
);

alter table game_stats enable row level security;

drop policy if exists game_stats_read_own on game_stats;
create policy game_stats_read_own on game_stats
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on game_stats from anon, authenticated;


-- ── Reports ───────────────────────────────────────────────────────────────
-- No filter catches everything. Someone will assemble something offensive out
-- of clean fragments, and this is the path for dealing with it by hand.

create table if not exists name_reports (
  id          bigserial primary key,
  profile_id  uuid not null references profiles(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

alter table name_reports enable row level security;
revoke all on name_reports from anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Functions - the ONLY write path available to a browser
--
-- Every one is `security definer` with an explicit search_path. The explicit
-- search_path is not decoration: without it, a definer function can be hijacked
-- by a caller who creates a same-named object in a schema earlier on the path.
-- ═══════════════════════════════════════════════════════════════════════════

-- Today's date in the game's timezone, decided by the server. The client does
-- not get to say what day it is.
create or replace function dj_today()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Chicago')::date $$;


-- ── submit_score ──────────────────────────────────────────────────────────
-- Returns { accepted: bool, reason: text, day: date }.
-- accepted = false with reason 'already_submitted' is the normal path for a
-- second attempt on the same day, not an error.

create or replace function submit_score(
  p_game   text,
  p_score  int,
  p_detail jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_day   date := dj_today();
  v_def   game_defs%rowtype;
  v_new   integer;
  v_prev  date;
  v_st    game_stats%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('accepted', false, 'reason', 'not_authenticated');
  end if;

  select * into v_def from game_defs where game = p_game;
  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'unknown_game');
  end if;

  -- Range check. This is not real anti-cheat - the game runs in the browser,
  -- so a determined person can still post any in-range number. It stops
  -- nonsense values and makes the boards survive a bad client bug.
  if p_score < v_def.min_score or p_score > v_def.max_score then
    return jsonb_build_object('accepted', false, 'reason', 'out_of_range');
  end if;

  -- Cap the payload so detail cannot be used as free storage.
  if p_detail is not null and pg_column_size(p_detail) > 4096 then
    return jsonb_build_object('accepted', false, 'reason', 'detail_too_large');
  end if;

  -- A player must have a profile (and therefore a moderated name) before
  -- appearing on a board.
  if not exists (select 1 from profiles where id = v_user) then
    return jsonb_build_object('accepted', false, 'reason', 'no_profile');
  end if;

  insert into scores (user_id, game, day, score, detail)
  values (v_user, p_game, v_day, p_score, p_detail)
  on conflict (user_id, game, day) do nothing;

  get diagnostics v_new = row_count;   -- integer, not boolean

  if v_new = 0 then
    return jsonb_build_object('accepted', false, 'reason', 'already_submitted', 'day', v_day);
  end if;

  -- Roll up lifetime stats in the same transaction.
  select * into v_st from game_stats where user_id = v_user and game = p_game;
  v_prev := v_st.last_day;

  insert into game_stats (user_id, game, played, best, total_score, cur_streak, best_streak, last_day, updated_at)
  values (
    v_user, p_game, 1, p_score, p_score,
    1, 1, v_day, now()
  )
  on conflict (user_id, game) do update set
    played      = game_stats.played + 1,
    total_score = game_stats.total_score + p_score,
    best        = case
                    when game_stats.best is null then p_score
                    when v_def.sort_mult = 1 then greatest(game_stats.best, p_score)
                    else least(game_stats.best, p_score)
                  end,
    cur_streak  = case when v_prev = v_day - 1 then game_stats.cur_streak + 1 else 1 end,
    best_streak = greatest(
                    game_stats.best_streak,
                    case when v_prev = v_day - 1 then game_stats.cur_streak + 1 else 1 end
                  ),
    last_day    = v_day,
    updated_at  = now();

  return jsonb_build_object('accepted', true, 'day', v_day);
end;
$$;


-- ── get_leaderboard ───────────────────────────────────────────────────────
-- Signed-out players can read boards, which is what makes them worth sharing.
-- Imported stats never appear here - only real submitted scores.

create or replace function get_leaderboard(
  p_game  text,
  p_day   date default null,
  p_limit int  default 20
)
returns table (
  rank     bigint,
  username text,
  score    int,
  is_me    boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with cfg as (
    select coalesce(p_day, dj_today()) as day,
           least(greatest(coalesce(p_limit, 20), 1), 100) as lim,
           (select sort_mult from game_defs where game = p_game) as mult
  )
  select
    row_number() over (
      order by s.score * (select mult from cfg) desc, s.created_at asc
    ) as rank,
    p.username,
    s.score,
    (s.user_id = auth.uid()) as is_me
  from scores s
  join profiles p on p.id = s.user_id
  cross join cfg
  where s.game = p_game
    and s.day  = cfg.day
  order by rank
  limit (select lim from cfg);
$$;


-- ── get_my_rank ───────────────────────────────────────────────────────────
-- So a player outside the top 20 still sees where they landed.

create or replace function get_my_rank(p_game text, p_day date default null)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with cfg as (
    select coalesce(p_day, dj_today()) as day,
           (select sort_mult from game_defs where game = p_game) as mult
  ),
  ranked as (
    select s.user_id,
           s.score,
           row_number() over (
             order by s.score * (select mult from cfg) desc, s.created_at asc
           ) as rank,
           count(*) over () as total
    from scores s cross join cfg
    where s.game = p_game and s.day = cfg.day
  )
  select case when auth.uid() is null then null
         else (select jsonb_build_object('rank', rank, 'score', score, 'total', total)
               from ranked where user_id = auth.uid())
         end;
$$;


-- ── Grants ────────────────────────────────────────────────────────────────
--
-- RLS decides WHICH ROWS a role may see. A GRANT decides whether it may touch
-- the table at all. Both are required and they are not substitutes: with
-- policies but no grant, PostgREST answers "permission denied for table"; with
-- a grant but no policy, it returns zero rows.
--
-- In `public`, Supabase's default privileges hand these out invisibly. A schema
-- you create inherits nothing, so every grant below has to be explicit. As of
-- the 2026 Data API change this is the model in `public` too.
--
-- Note what is NOT here: no INSERT, UPDATE or DELETE to anon or authenticated,
-- on any table. Every write goes through the definer functions. That is what
-- makes shipping the publishable key in the browser safe.

grant select on game_defs  to anon, authenticated;   -- public, drives the boards
grant select on profiles   to authenticated;         -- policy narrows to own row
grant select on scores     to authenticated;         -- policy narrows to own rows
grant select on game_stats to authenticated;         -- policy narrows to own rows
-- name_reports: deliberately no grant to anyone. Moderation is dashboard-only.

-- In `public`, Supabase's default privileges have ALREADY granted select on
-- these to anon before this migration runs, so granting above is not enough -
-- the inherited grant has to come off. RLS already returns no rows to anon, so
-- this is defence in depth: it means a future permissive policy cannot
-- accidentally expose them. In a created schema there is nothing to revoke and
-- this is a harmless no-op, which is exactly why it lives in the shared
-- template rather than only in the public file.
revoke select on profiles, scores, game_stats from anon;

-- The Edge Function holds the secret key, which maps to service_role. It
-- bypasses RLS but still needs ordinary table privileges in a custom schema.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Revoke from PUBLIC first: functions are executable by everyone by default,
-- which is the single easiest way to leave a definer function wide open.

revoke all on function submit_score(text, int, jsonb)   from public;
revoke all on function get_leaderboard(text, date, int)  from public;
revoke all on function get_my_rank(text, date)           from public;
revoke all on function dj_today()                        from public;

grant execute on function submit_score(text, int, jsonb) to authenticated;
grant execute on function get_leaderboard(text, date, int) to anon, authenticated;
grant execute on function get_my_rank(text, date)          to authenticated;
grant execute on function dj_today()                       to anon, authenticated;
