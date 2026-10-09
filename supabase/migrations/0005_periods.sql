-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - the leaderboards page becomes "my lifetime stats, and how I
-- compare". Template; __SCHEMA__ must be substituted. ./generate.sh
--
-- The page previously answered "who is winning today". It now answers "how am
-- I doing", with a global period filter (daily / weekly / lifetime) defaulting
-- to lifetime. That needs two things the schema did not have: aggregation over
-- a window, and the player's own RANK per stat rather than just a top-N list.
--
-- Everything is computed from `scores`, not `game_stats`, for two reasons: it
-- gives the same shape for all three periods, and imported stats never created
-- score rows so they are excluded automatically rather than by a flag.
-- Streaks are the exception - only game_stats tracks them, and they have no
-- daily or weekly meaning.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = __SCHEMA__;

-- ── What counts as a notable result, per game ────────────────────────────
-- Expressed as an operator plus a value rather than a SQL snippet, so nothing
-- executable lives in a data column.
alter table game_defs add column if not exists notable_op    text;
alter table game_defs add column if not exists notable_value int;
alter table game_defs add column if not exists notable_label text;

update game_defs set notable_op='lte', notable_value=6,   notable_label='Wins'            where game='themedle';
update game_defs set notable_op='eq',  notable_value=20,  notable_label='Perfect games'   where game='chainlink';
update game_defs set notable_op='lte', notable_value=8,   notable_label='Wins'            where game='spelldle';
update game_defs set notable_op='gt',  notable_value=0,   notable_label='Winning days'    where game='blackjackdle';
update game_defs set notable_op='gt',  notable_value=0,   notable_label='Winning days'    where game='roulettedle';
update game_defs set notable_op='gt',  notable_value=0,   notable_label='Winning days'    where game='holdle';
update game_defs set notable_op='eq',  notable_value=3,   notable_label='Tables won'      where game='liarsdice';
update game_defs set notable_op='eq',  notable_value=0,   notable_label='Perfect zeros'   where game='netzero';
update game_defs set notable_op='eq',  notable_value=0,   notable_label='Boxes shut'      where game='shutthebox';
-- Yachtdle is the one exception: a Yacht is 50 points inside a 375 total, so
-- "rolled a Yacht" cannot be derived from the score. Its period-countable brag
-- is a big score instead; Yachts rolled stays a lifetime number from extras.
update game_defs set notable_op='gte', notable_value=250, notable_label='Scores of 250+'  where game='yachtdle';


-- ── The one call that paints the page ────────────────────────────────────
-- p_period: 'daily' | 'weekly' | 'lifetime'
--
-- Returns a row per game whether or not the player has played it, so the page
-- can show every game with an honest empty state rather than hiding it.
-- Streak columns are null for daily and weekly - a streak is not a window.
create or replace function get_period_summary(p_period text default 'lifetime')
returns table (
  game           text,
  label          text,
  score_label    text,
  notable_label  text,
  sort_order     int,
  my_played      int,
  my_best        int,
  my_total       bigint,
  my_notable     int,
  my_cur_streak  int,
  my_best_streak int,
  rank_played    int,
  rank_best      int,
  rank_notable   int,
  players        int
)
language sql
security definer
set search_path = __SCHEMA__, pg_temp
stable
as $$
  with win as (
    select case p_period
             when 'daily'  then dj_today()
             when 'weekly' then dj_today() - 6      -- 7 days inclusive
             else '1970-01-01'::date
           end as from_day
  ),
  agg as (
    select s.user_id,
           s.game,
           count(*)::int                                            as played,
           sum(s.score)::bigint                                     as total,
           (case when d.sort_mult = 1 then max(s.score)
                 else min(s.score) end)::int                        as best,
           count(*) filter (where
             case d.notable_op
               when 'eq'  then s.score =  d.notable_value
               when 'lte' then s.score <= d.notable_value
               when 'gte' then s.score >= d.notable_value
               when 'gt'  then s.score >  d.notable_value
               else false
             end)::int                                              as notable
    from scores s
    join game_defs d on d.game = s.game
    cross join win w
    where s.day >= w.from_day
    group by s.user_id, s.game, d.sort_mult, d.notable_op, d.notable_value
  ),
  ranked as (
    select a.*,
           rank() over (partition by a.game order by a.played  desc)                      as rank_played,
           rank() over (partition by a.game order by a.best * d.sort_mult desc)           as rank_best,
           rank() over (partition by a.game order by a.notable desc)                      as rank_notable,
           count(*) over (partition by a.game)                                            as players
    from agg a
    join game_defs d on d.game = a.game
  ),
  mine as (
    select * from ranked where user_id = auth.uid()
  ),
  counts as (
    select game, max(players) as players from ranked group by game
  )
  select d.game,
         d.label,
         d.score_label,
         d.notable_label,
         d.sort_order,
         coalesce(m.played, 0)::int,
         m.best,
         m.total,
         coalesce(m.notable, 0)::int,
         case when p_period = 'lifetime' then g.cur_streak  else null end,
         case when p_period = 'lifetime' then g.best_streak else null end,
         m.rank_played::int,
         m.rank_best::int,
         m.rank_notable::int,
         coalesce(c.players, 0)::int
  from game_defs d
  left join mine   m on m.game = d.game
  left join counts c on c.game = d.game
  left join game_stats g on g.game = d.game and g.user_id = auth.uid() and not g.imported
  order by d.sort_order;
$$;


-- ── Boards, now window-aware ────────────────────────────────────────────
-- Replaces the 3-arg form. Metrics that only make sense over a window are
-- computed from scores; streaks still come from game_stats and are therefore
-- lifetime-only whatever period is asked for.
create or replace function get_game_board(
  p_game   text,
  p_metric text default 'played',
  p_limit  int  default 10,
  p_period text default 'lifetime'
)
returns table (rank bigint, username text, value numeric, is_me boolean)
language plpgsql
security definer
set search_path = __SCHEMA__, pg_temp
stable
as $$
declare
  v_lim  int := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_from date;
  v_def  game_defs%rowtype;
begin
  select * into v_def from game_defs where game = p_game;
  if v_def.game is null then return; end if;

  v_from := case p_period
              when 'daily'  then dj_today()
              when 'weekly' then dj_today() - 6
              else '1970-01-01'::date
            end;

  -- Streaks have no windowed form; serve them from the lifetime rollup.
  if p_metric in ('best_streak', 'cur_streak') then
    return query
      select rank() over (order by
               case p_metric when 'best_streak' then g.best_streak else g.cur_streak end desc),
             p.username,
             (case p_metric when 'best_streak' then g.best_streak else g.cur_streak end)::numeric,
             (g.user_id = auth.uid())
      from game_stats g join profiles p on p.id = g.user_id
      where g.game = p_game and not g.imported and g.played > 0
      order by 1 limit v_lim;
    return;
  end if;

  -- Chip stacks and other point-in-time extras are also lifetime-only.
  if p_metric like 'extras:%' then
    return query
      select rank() over (order by (g.extras ->> substring(p_metric from 8))::numeric desc),
             p.username,
             (g.extras ->> substring(p_metric from 8))::numeric,
             (g.user_id = auth.uid())
      from game_stats g join profiles p on p.id = g.user_id
      where g.game = p_game and not g.imported
        and jsonb_typeof(g.extras -> substring(p_metric from 8)) = 'number'
      order by 1 limit v_lim;
    return;
  end if;

  return query
    with agg as (
      select s.user_id,
             count(*)::numeric                                     as played,
             sum(s.score)::numeric                                 as total,
             (case when v_def.sort_mult = 1 then max(s.score)
                   else min(s.score) end)::numeric                 as best,
             count(*) filter (where
               case v_def.notable_op
                 when 'eq'  then s.score =  v_def.notable_value
                 when 'lte' then s.score <= v_def.notable_value
                 when 'gte' then s.score >= v_def.notable_value
                 when 'gt'  then s.score >  v_def.notable_value
                 else false
               end)::numeric                                       as notable,
             max(s.created_at)                                     as last_at
      from scores s
      where s.game = p_game and s.day >= v_from
      group by s.user_id
    ),
    pick as (
      select a.user_id, a.last_at,
             case p_metric
               when 'played'  then a.played
               when 'total'   then a.total
               when 'notable' then a.notable
               else a.best
             end as v,
             case p_metric when 'best' then v_def.sort_mult else 1 end as mult
      from agg a
    )
    select rank() over (order by k.v * k.mult desc, k.last_at asc),
           p.username, k.v, (k.user_id = auth.uid())
    from pick k join profiles p on p.id = k.user_id
    where k.v is not null
    order by 1 limit v_lim;
end;
$$;


revoke all on function get_period_summary(text)                   from public;
revoke all on function get_game_board(text, text, int, text)      from public;
grant execute on function get_period_summary(text)                to anon, authenticated;
grant execute on function get_game_board(text, text, int, text)   to anon, authenticated;

-- The 3-arg board is superseded by the 4-arg form.
drop function if exists get_game_board(text, text, int);
