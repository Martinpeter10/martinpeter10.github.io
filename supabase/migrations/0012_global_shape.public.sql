-- GENERATED FROM 0012_global_shape.sql - DO NOT EDIT BY HAND.
-- Target schema: public
-- Regenerate with ./generate.sh after changing the template.

-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - make each game's "Everyone" panel say something that game
-- actually means. Template; public must be substituted. ./generate.sh
--
-- 0011 showed every game the same four rows plus a distribution. Uniform, and
-- wrong in two places:
--
--   Chain Link's distribution was noise. A 0-20 score spread over however
--   many players is a chart nobody reads; the average and the perfect-game
--   count already say it.
--
--   The chip games read "Winning days: 1 (100%)". `notable_op gt 0` is the
--   right SUM - players who finished up - but "winning days" is a lifetime
--   phrase, and the panel is one day. Over a single day it is a percentage of
--   players, not a count of days, and it should say so.
--
-- So presentation differs by game family, and the family belongs in game_defs
-- with the rest of the per-game metadata rather than as a list of game ids in
-- the JavaScript. A new game sets two columns; globalstats.js does not change.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public;

-- global_dist: is a bar-per-score chart worth showing? Only where the score
-- is a small ordinal with a canonical range - a guess count. Everywhere else
-- it is a chart of noise.
alter table game_defs add column if not exists global_dist boolean not null default false;

-- global_kind: which panel shape to render. 'chips' means a session net, where
-- "how many finished up" and "the biggest swing either way" are the numbers a
-- player can compare themselves against. null means the default shape.
alter table game_defs add column if not exists global_kind text;

update game_defs set global_dist = true  where game in ('themedle', 'spelldle');
update game_defs set global_dist = false where game not in ('themedle', 'spelldle');
update game_defs set global_kind = 'chips'
 where game in ('blackjackdle', 'roulettedle', 'holdle');
update game_defs set global_kind = null
 where game not in ('blackjackdle', 'roulettedle', 'holdle');


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
  v_def     game_defs%rowtype;
  v_from    date;
  v_plays   int;
  v_players int;
  v_avg     numeric;
  v_notable int;
  v_min     int;
  v_max     int;
  v_dist    jsonb;
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
      'notable_label', v_def.notable_label, 'kind', v_def.global_kind,
      'dist', '[]'::jsonb);
  end if;

  -- The FULL range, zeros included. A guess distribution with the empty
  -- buckets missing reads as though those scores are impossible rather than
  -- unachieved, and the bars no longer line up day to day.
  if v_def.global_dist then
    select jsonb_agg(jsonb_build_object(
             'v', g.v,
             'n', coalesce(c.n, 0),
             -- Past the success threshold is a loss, not an Nth guess.
             'loss', (v_def.notable_op = 'lte' and g.v > v_def.notable_value)
           ) order by g.v)
      into v_dist
      from generate_series(greatest(v_def.min_score, 1), v_def.max_score) as g(v)
      left join (select score, count(*) as n
                   from scores
                  where game = p_game and day >= v_from
                  group by score) c on c.score = g.v;
  else
    v_dist := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'game',          p_game,
    'period',        p_period,
    'label',         v_def.label,
    'score_label',   v_def.score_label,
    'notable_label', v_def.notable_label,
    'kind',          v_def.global_kind,
    'sort_mult',     v_def.sort_mult,
    'plays',         v_plays,
    'players',       v_players,
    'avg',           v_avg,
    'notable',       v_notable,
    -- Both ends. The chip games need the losing end as much as the winning
    -- one: "the biggest hit anyone took today" is half the comparison.
    'best',          case when v_def.sort_mult = 1 then v_max else v_min end,
    'worst',         case when v_def.sort_mult = 1 then v_min else v_max end,
    'dist',          coalesce(v_dist, '[]'::jsonb)
  );
end;
$$;

revoke all on function get_game_global(text, text) from public;
grant execute on function get_game_global(text, text) to authenticated;
