-- GENERATED FROM 0011_global_stats.sql - DO NOT EDIT BY HAND.
-- Target schema: public
-- Regenerate with ./generate.sh after changing the template.

-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - "how did everyone else do", inside each game's stats modal.
-- Template; public must be substituted. Regenerate with ./generate.sh
--
-- The per-game stats modal only ever showed the player their own trend. This
-- adds the other half: what everybody scored, so a 4-guess Themedle means
-- something.
--
-- ONE function for all ten games, because the per-game differences are
-- already described in `game_defs` and do not need new code:
--
--   score_label    what the number IS            "Guesses", "Session net"
--   sort_mult      which direction is good        -1 = lower is better
--   notable_*      what counts as a good result   lte 6, eq 20, gt 0 ...
--
-- notable_* was added for the leaderboards page and turns out to be exactly
-- the "what fraction of people succeeded" rule each game needs: Themedle's
-- is "Wins / score <= 6", Chain Link's is "Perfect games / score = 20", the
-- chip games' is "Winning days / score > 0". So the global success rate comes
-- out per game, correctly labelled, with no per-game branching here.
--
-- Everything is computed from `scores`, like the leaderboards - so imported
-- stats are excluded automatically rather than by a flag, because they never
-- created score rows.
--
-- SIGNED IN ONLY, and that is the product decision rather than a privacy one:
-- a player's own stats work signed out exactly as they always have, and seeing
-- how everyone else did is what an account buys. Granting anon would make the
-- gate cosmetic - one curl away - so the grant is `authenticated` alone and
-- the client shows a sign-in pitch instead of calling this.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public;

create or replace function get_game_global(
  p_game   text,
  p_period text default 'lifetime'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_def      game_defs%rowtype;
  v_from     date;
  v_plays    int;
  v_players  int;
  v_avg      numeric;
  v_notable  int;
  v_min      int;
  v_max      int;
  v_discrete boolean;
  v_dist     jsonb;
begin
  select * into v_def from game_defs where game = p_game;
  if v_def.game is null then
    return jsonb_build_object('error', 'unknown_game');
  end if;

  v_from := case p_period
              when 'daily'  then dj_today()
              when 'weekly' then dj_today() - 6
              else '1970-01-01'::date
            end;

  select count(*),
         count(distinct user_id),
         round(avg(score)::numeric, 2),
         count(*) filter (where
           case v_def.notable_op
             when 'eq'  then score =  v_def.notable_value
             when 'lte' then score <= v_def.notable_value
             when 'gte' then score >= v_def.notable_value
             when 'gt'  then score >  v_def.notable_value
             else false
           end),
         min(score),
         max(score)
    into v_plays, v_players, v_avg, v_notable, v_min, v_max
    from scores
   where game = p_game and day >= v_from;

  if coalesce(v_plays, 0) = 0 then
    return jsonb_build_object(
      'game', p_game, 'period', p_period, 'plays', 0, 'players', 0,
      'label', v_def.label, 'score_label', v_def.score_label,
      'notable_label', v_def.notable_label, 'dist', '[]'::jsonb);
  end if;

  -- A bar per distinct score where the spread is small enough to read - which
  -- is every guess-count game, and the one shape players already expect from
  -- a daily word game. Wider games (Yachtdle 0-375, the chip games' net) get
  -- ten buckets instead; a 375-bar chart is not a chart.
  v_discrete := (v_max - v_min) <= 24;

  if v_discrete then
    select jsonb_agg(jsonb_build_object('v', s, 'n', c) order by s)
      into v_dist
      from (select score as s, count(*) as c
              from scores
             where game = p_game and day >= v_from
             group by score) q;
  else
    -- Buckets come from the REAL spread, not game_defs min/max: the chip
    -- games are bounded at +/-100000 as a sanity check, while actual session
    -- nets live in the hundreds, so bucketing by the declared bounds would
    -- put every result in one bar.
    select jsonb_agg(jsonb_build_object('lo', lo, 'hi', hi, 'n', c) order by lo)
      into v_dist
      from (select min(score) as lo, max(score) as hi, count(*) as c
              from (select score,
                           width_bucket(score::numeric, v_min, v_max + 1, 10) as b
                      from scores
                     where game = p_game and day >= v_from) x
             group by b) q;
  end if;

  return jsonb_build_object(
    'game',          p_game,
    'period',        p_period,
    'label',         v_def.label,
    'score_label',   v_def.score_label,
    'notable_label', v_def.notable_label,
    'sort_mult',     v_def.sort_mult,
    'plays',         v_plays,
    'players',       v_players,
    'avg',           v_avg,
    'notable',       v_notable,
    'best',          case when v_def.sort_mult = 1 then v_max else v_min end,
    'discrete',      v_discrete,
    'dist',          coalesce(v_dist, '[]'::jsonb)
  );
end;
$$;

revoke all on function get_game_global(text, text) from public;
grant execute on function get_game_global(text, text) to authenticated;
