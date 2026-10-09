-- GENERATED FROM 0007_averages.sql - DO NOT EDIT BY HAND.
-- Target schema: public
-- Regenerate with ./generate.sh after changing the template.

-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - rank the AVERAGE, not the best. Template; public must be
-- substituted. ./generate.sh
--
-- Six of the ten games have a best with a hard floor or ceiling that a decent
-- player reaches and then never loses: fewest guesses bottoms out at 1, a
-- perfect Chain Link is 20, a pure Net Zero is 0, shutting the box is 0,
-- winning a Liar's Dice table is 3. Ranking those freezes the board - everyone
-- who has ever had one good day sits tied at first, permanently, and the board
-- stops telling anyone anything.
--
-- The average never saturates and rewards a record rather than a lucky day, so
-- it becomes the ranked comparison. The best is kept as a personal milestone
-- and is only RANKED where it has no ceiling to hit: an unbounded chip day, or
-- a Yachtdle score.
--
-- An average needs a minimum number of results (min_games = 3) before it is
-- ranked, or a single first-day fluke outranks a long honest record forever.
-- Below that the page shows progress toward the minimum instead of a position.
--
-- NOTE: this supersedes get_period_summary and get_my_lifetime with
-- get_summary_v2. The originals are left in place because changing a
-- function's return type requires DROP, which was not available when this was
-- applied. Drop them by hand when convenient:
--   drop function if exists public.get_period_summary(text);
--   drop function if exists public.get_my_lifetime();
--   drop function if exists public.get_game_board(text, text, int);
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public;

alter table game_defs add column if not exists best_ranked boolean not null default true;

update game_defs set best_ranked = false
  where game in ('themedle','spelldle','chainlink','netzero','shutthebox','liarsdice');
