-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - a player's own numbers across every game. Template; __SCHEMA__
-- must be substituted. Regenerate with ./generate.sh
--
-- get_game_board answers "who is winning". This answers "how am I doing",
-- which is the other half of a leaderboards page and the part that makes it
-- worth returning to when you are not top of anything.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = __SCHEMA__;

create or replace function get_my_stats()
returns table (
  game        text,
  played      int,
  best        int,
  cur_streak  int,
  best_streak int,
  total_score bigint,
  extras      jsonb,
  imported    boolean
)
language sql
security definer
set search_path = __SCHEMA__, pg_temp
stable
as $$
  select g.game, g.played, g.best, g.cur_streak, g.best_streak,
         g.total_score, g.extras, g.imported
  from game_stats g
  where g.user_id = auth.uid()
  order by g.game;
$$;

revoke all on function get_my_stats() from public;
grant execute on function get_my_stats() to authenticated;
