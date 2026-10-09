-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - the per-game stats modal becomes cross-device. Template;
-- __SCHEMA__ must be substituted. Regenerate with ./generate.sh
--
-- WHAT WAS BROKEN
-- Signing in adopted today's board, the chip stack and the daily bonus, but
-- NOT the numbers in each game's own stats modal. Those live in localStorage
-- under cl_stats_v2 and friends and were never hydrated, so a player who
-- played on a desktop and then signed in on a phone saw an empty stats modal
-- while the game correctly refused to let them play again. Right day state,
-- missing history.
--
-- WHY A BLOB AND NOT COLUMNS
-- game_stats already holds played / wins / best / streaks / extras, but it
-- holds them in ONE shape. The ten games keep ten different shapes: guess
-- distributions, place arrays, per-opponent head-to-head records, biggest
-- loss, all-time net. Mapping those onto shared columns would mean ten
-- field-by-field translations and would still lose the ones with no column.
-- So the stats key is stored verbatim, exactly as game_state stores the
-- day's board, and the server does not interpret it.
--
-- This is a CACHE, not a source of truth. Leaderboards never read it - they
-- rank `scores` rows and the structured game_stats columns that submit_score
-- computes server-side. A forged blob changes only what its own owner sees in
-- their own modal, which was already true when it lived in localStorage.
--
-- It lives on `progress`, not `game_state`, because it is cumulative and must
-- survive the date rollover.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = __SCHEMA__;

-- Keyed by the game's own localStorage key so one game can mirror several:
--   { "hd_stats_v2": {...}, "hd_alltime_v2": {...}, "hd_ai_stats_v3": {...} }
-- Keying by the real key means a future stats-key version bump (_v2 -> _v3)
-- lands as a new entry and the stale one is simply never read, which is the
-- same way the localStorage convention already handles it.
alter table progress add column if not exists stats jsonb;


-- ── get_game_state, now carrying the stats blob ──────────────────────────
-- Same signature, so no overload and no DROP. One round trip still paints
-- the whole page.
create or replace function get_game_state(p_game text)
returns jsonb
language plpgsql
security definer
set search_path = __SCHEMA__, pg_temp
stable
as $$
declare
  v_user uuid := auth.uid();
  v_day  date := dj_today();
  v_st   game_state%rowtype;
  v_pr   progress%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('signed_in', false);
  end if;

  select * into v_st from game_state
   where user_id = v_user and game = p_game and day = v_day;
  select * into v_pr from progress
   where user_id = v_user and game = p_game;

  return jsonb_build_object(
    'signed_in', true,
    'day',       v_day,
    'state',     v_st.state,          -- null when today has not started
    'complete',  coalesce(v_st.complete, false),
    'chips',     v_pr.chips,          -- null means "never played, use base"
    'bonus_day', v_pr.bonus_day,
    'stats',     v_pr.stats           -- null means "nothing stored yet"
  );
end;
$$;


-- ── save_game_stats ───────────────────────────────────────────────────────
-- Deliberately a SEPARATE function rather than another argument on
-- save_game_state. Adding an optional parameter there would leave two
-- overloads whose named-argument calls overlap, and PostgREST answers that
-- with PGRST203 rather than picking one.
--
-- `p_merge` is how a first sign-in works. Called with merge = true, an
-- existing server blob wins and the local one is discarded; called with
-- merge = false the caller's blob replaces whatever is there. The client
-- seeds with merge = true exactly once, when the server has nothing and the
-- browser has real history, so a desktop's existing numbers become the
-- account's instead of being thrown away - and a freshly installed phone
-- cannot overwrite them with zeros, because the server already has a row by
-- then.
create or replace function save_game_stats(
  p_game  text,
  p_stats jsonb,
  p_merge boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = __SCHEMA__, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_cur  jsonb;
begin
  if v_user is null then
    return jsonb_build_object('saved', false, 'reason', 'not_authenticated');
  end if;
  if not exists (select 1 from game_defs where game = p_game) then
    return jsonb_build_object('saved', false, 'reason', 'unknown_game');
  end if;
  if p_stats is null or jsonb_typeof(p_stats) <> 'object' then
    return jsonb_build_object('saved', false, 'reason', 'bad_stats');
  end if;
  -- A stats blob is a handful of counters. Anything near this is a bug or an
  -- attempt to use the row as storage.
  if pg_column_size(p_stats) > 16384 then
    return jsonb_build_object('saved', false, 'reason', 'stats_too_large');
  end if;

  if p_merge then
    select stats into v_cur from progress where user_id = v_user and game = p_game;
    if v_cur is not null then
      return jsonb_build_object('saved', false, 'reason', 'already_seeded');
    end if;
  end if;

  insert into progress (user_id, game, stats, updated_at)
  values (v_user, p_game, p_stats, now())
  on conflict (user_id, game) do update set
    stats      = case when p_merge then coalesce(progress.stats, p_stats) else p_stats end,
    updated_at = now();

  return jsonb_build_object('saved', true);
end;
$$;


revoke all on function save_game_stats(text, jsonb, boolean) from public;
grant execute on function save_game_stats(text, jsonb, boolean) to authenticated;
