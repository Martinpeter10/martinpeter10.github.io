-- GENERATED FROM 0006_extras_rank.sql - DO NOT EDIT BY HAND.
-- Target schema: app_tst
-- Regenerate with ./generate.sh after changing the template.

-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - the lifetime-only figures the summary could not carry.
-- Template; app_tst must be substituted. ./generate.sh
--
-- The leaderboards page showed a chip stack row with no value and no rank:
-- get_period_summary never returned extras at all. Adding them to its result
-- would have changed the function's return type, which Postgres only permits
-- after a DROP - so this is a second, additive function instead.
--
-- That split turns out to be the honest shape anyway: streak ranks and
-- point-in-time extras are lifetime-only, so the page skips this call entirely
-- on the daily and weekly periods.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = app_tst;

-- Which extras key each game features, and what to call it.
alter table game_defs add column if not exists extra_key   text;
alter table game_defs add column if not exists extra_label text;

update game_defs set extra_key='chips_now',    extra_label='Chip stack'
  where game in ('blackjackdle','roulettedle','holdle');
update game_defs set extra_key='yachts_total', extra_label='Yachts rolled'
  where game='yachtdle';

create or replace function get_my_lifetime()
returns table (
  game text, extra_label text, my_extra numeric, rank_extra int,
  my_best_streak int, rank_streak int, ranked_players int
)
language sql
security definer
set search_path = app_tst, pg_temp
stable
as $fn$
  with life as (
    select g.game, g.user_id, g.best_streak,
           (g.extras ->> d.extra_key)::numeric as extra_val,
           rank() over (partition by g.game order by g.best_streak desc)              as rk_streak,
           rank() over (partition by g.game
                        order by (g.extras ->> d.extra_key)::numeric desc nulls last) as rk_extra,
           count(*) over (partition by g.game)                                        as players
    from game_stats g
    join game_defs d on d.game = g.game
    where not g.imported and g.played > 0
  )
  select d.game,
         d.extra_label,
         l.extra_val,
         case when l.extra_val is not null then l.rk_extra::int else null end,
         l.best_streak,
         case when l.best_streak is not null then l.rk_streak::int else null end,
         coalesce(l.players, 0)::int
  from game_defs d
  left join life l on l.game = d.game and l.user_id = auth.uid()
  order by d.sort_order;
$fn$;

grant execute on function get_my_lifetime() to authenticated;
revoke all on function get_my_lifetime() from anon;
