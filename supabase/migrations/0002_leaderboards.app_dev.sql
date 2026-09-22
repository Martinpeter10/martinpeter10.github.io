-- GENERATED FROM 0002_leaderboards.sql - DO NOT EDIT BY HAND.
-- Target schema: app_dev
-- Regenerate with ./generate.sh after changing the template.

-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm leaderboards - template. app_dev must be substituted.
-- Use the generated files: 0002_leaderboards.{public,app_tst,app_dev}.sql
-- Regenerate with ./generate.sh
--
-- 0001 gave every game one score per player per day plus a lifetime rollup.
-- That is enough for a daily top-20 and nothing else. The leaderboards page
-- wants things the rollup has no column for: perfect Chain Links, Yachts
-- rolled, boxes shut, current chip stacks. Rather than bolt ten columns onto
-- game_stats for stats only one game each uses, game-specific counters live in
-- a jsonb `extras` bag and the board function reads them by key.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = app_dev;

-- ── Per-game counters that only that game understands ────────────────────
-- chainlink -> {"perfect": 12}
-- yachtdle  -> {"yachts": 3, "bonuses": 8}
-- holdle    -> {"chips": 1450, "biggest_win": 300, "net": -220}
alter table game_stats add column if not exists extras jsonb not null default '{}'::jsonb;

-- ── Game registry gains display + direction metadata ──────────────────────
alter table game_defs add column if not exists sort_order int not null default 100;
alter table game_defs add column if not exists score_label text;

-- Every game DailyJamm ships. min/max are sanity bounds for submit_score, not
-- scoring rules - they only have to be wide enough for a legitimate result and
-- narrow enough to reject nonsense.
insert into game_defs (game, label, min_score, max_score, sort_mult, sort_order, score_label) values
  ('themedle',     'Themedle',       0,    7,  -1,  10, 'Guesses'),
  ('chainlink',    'Chain Link',     0,   20,   1,  20, 'Score'),
  ('spelldle',     'Spelldle',       0,    9,  -1,  30, 'Guesses'),
  ('blackjackdle', 'BlackJackdle', -100000, 100000, 1, 40, 'Session net'),
  ('roulettedle',  'Roulettedle',  -100000, 100000, 1, 50, 'Session net'),
  ('holdle',       'Holdle',       -100000, 100000, 1, 60, 'Session net'),
  ('liarsdice',    'Liar''s Dice',   0,    3,   1,  70, 'Players outlasted'),
  ('netzero',      'Net Zero',       0,  100,  -1,  80, 'Distance from zero'),
  ('shutthebox',   'Shut the Box',   0,   45,  -1,  90, 'Tiles left'),
  ('yachtdle',     'Yachtdle',       0,  375,   1, 100, 'Score')
on conflict (game) do update set
  label       = excluded.label,
  min_score   = excluded.min_score,
  max_score   = excluded.max_score,
  sort_mult   = excluded.sort_mult,
  sort_order  = excluded.sort_order,
  score_label = excluded.score_label;


-- ── submit_score, extended to carry extras ────────────────────────────────
-- Extras are MERGED, and numeric ones take the better value rather than the
-- latest: a player's best chip stack should not fall because today went badly.
-- Counters (keys ending _total, or listed as cumulative) add up instead.
create or replace function submit_score(
  p_game   text,
  p_score  int,
  p_detail jsonb default null,
  p_extras jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = app_dev, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_day   date := dj_today();
  v_def   game_defs%rowtype;
  v_new   boolean;
  v_prev  date;
  v_st    game_stats%rowtype;
  v_ex    jsonb;
  k       text;
begin
  if v_user is null then
    return jsonb_build_object('accepted', false, 'reason', 'not_authenticated');
  end if;

  select * into v_def from game_defs where game = p_game;
  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'unknown_game');
  end if;

  if p_score < v_def.min_score or p_score > v_def.max_score then
    return jsonb_build_object('accepted', false, 'reason', 'out_of_range');
  end if;

  if p_detail is not null and pg_column_size(p_detail) > 4096 then
    return jsonb_build_object('accepted', false, 'reason', 'detail_too_large');
  end if;
  if p_extras is not null and pg_column_size(p_extras) > 2048 then
    return jsonb_build_object('accepted', false, 'reason', 'extras_too_large');
  end if;

  if not exists (select 1 from profiles where id = v_user) then
    return jsonb_build_object('accepted', false, 'reason', 'no_profile');
  end if;

  insert into scores (user_id, game, day, score, detail)
  values (v_user, p_game, v_day, p_score, p_detail)
  on conflict (user_id, game, day) do nothing;

  get diagnostics v_new = row_count;

  if v_new = 0 then
    return jsonb_build_object('accepted', false, 'reason', 'already_submitted', 'day', v_day);
  end if;

  select * into v_st from game_stats where user_id = v_user and game = p_game;
  v_prev := v_st.last_day;

  insert into game_stats (user_id, game, played, best, total_score,
                          cur_streak, best_streak, last_day, extras, updated_at)
  values (v_user, p_game, 1, p_score, p_score, 1, 1, v_day,
          coalesce(p_extras, '{}'::jsonb), now())
  on conflict (user_id, game) do update set
    played      = game_stats.played + 1,
    total_score = game_stats.total_score + p_score,
    best        = case
                    when game_stats.best is null then p_score
                    when v_def.sort_mult = 1 then greatest(game_stats.best, p_score)
                    else least(game_stats.best, p_score)
                  end,
    cur_streak  = case when v_prev = v_day - 1 then game_stats.cur_streak + 1 else 1 end,
    best_streak = greatest(game_stats.best_streak,
                    case when v_prev = v_day - 1 then game_stats.cur_streak + 1 else 1 end),
    last_day    = v_day,
    updated_at  = now();

  -- Merge extras key by key, by suffix:
  --   _total  accumulates   (perfect games, Yachts rolled)
  --   _now    overwrites    (current chip stack - it must be allowed to fall)
  --   other   keeps the max (personal bests, never revised downwards)
  if p_extras is not null then
    select extras into v_ex from game_stats where user_id = v_user and game = p_game;
    for k in select jsonb_object_keys(p_extras) loop
      if jsonb_typeof(p_extras -> k) = 'number' then
        if k like '%\_total' then
          v_ex := jsonb_set(v_ex, array[k],
                    to_jsonb(coalesce((v_ex ->> k)::numeric, 0) + (p_extras ->> k)::numeric));
        elsif k like '%\_now' then
          v_ex := jsonb_set(v_ex, array[k], p_extras -> k);
        else
          v_ex := jsonb_set(v_ex, array[k],
                    to_jsonb(greatest(coalesce((v_ex ->> k)::numeric, (p_extras ->> k)::numeric),
                                      (p_extras ->> k)::numeric)));
        end if;
      else
        v_ex := jsonb_set(v_ex, array[k], p_extras -> k);
      end if;
    end loop;
    update game_stats set extras = v_ex where user_id = v_user and game = p_game;
  end if;

  return jsonb_build_object('accepted', true, 'day', v_day);
end;
$$;


-- ── One generic board function ────────────────────────────────────────────
-- p_metric:
--   'today'            today's score, direction from game_defs
--   'played'           most games played
--   'best_streak'      longest run
--   'cur_streak'       current run
--   'best'             personal best score, direction from game_defs
--   'total_score'      cumulative
--   'extras:<key>'     any numeric key in the extras bag, always high-to-low
--
-- Imported stats are excluded: game_stats rows flagged `imported` never rank.
create or replace function get_game_board(
  p_game   text,
  p_metric text default 'today',
  p_limit  int  default 10
)
returns table (rank bigint, username text, value numeric, is_me boolean)
language plpgsql
security definer
set search_path = app_dev, pg_temp
stable
as $$
declare
  v_mult int;
  v_lim  int := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_key  text;
begin
  select sort_mult into v_mult from game_defs where game = p_game;
  if v_mult is null then return; end if;

  if p_metric = 'today' then
    return query
      select row_number() over (order by s.score * v_mult desc, s.created_at asc),
             p.username, s.score::numeric, (s.user_id = auth.uid())
      from scores s join profiles p on p.id = s.user_id
      where s.game = p_game and s.day = dj_today()
      order by 1 limit v_lim;

  elsif p_metric like 'extras:%' then
    v_key := substring(p_metric from 8);
    return query
      select row_number() over (order by (g.extras ->> v_key)::numeric desc, g.updated_at asc),
             p.username, (g.extras ->> v_key)::numeric, (g.user_id = auth.uid())
      from game_stats g join profiles p on p.id = g.user_id
      where g.game = p_game
        and not g.imported
        and jsonb_typeof(g.extras -> v_key) = 'number'
      order by 1 limit v_lim;

  else
    return query
      select row_number() over (
               order by case p_metric
                          when 'played'      then g.played::numeric
                          when 'best_streak' then g.best_streak::numeric
                          when 'cur_streak'  then g.cur_streak::numeric
                          when 'total_score' then g.total_score::numeric
                          when 'best'        then g.best::numeric * v_mult
                        end desc nulls last,
               g.updated_at asc),
             p.username,
             case p_metric
               when 'played'      then g.played::numeric
               when 'best_streak' then g.best_streak::numeric
               when 'cur_streak'  then g.cur_streak::numeric
               when 'total_score' then g.total_score::numeric
               when 'best'        then g.best::numeric
             end,
             (g.user_id = auth.uid())
      from game_stats g join profiles p on p.id = g.user_id
      where g.game = p_game and not g.imported and g.played > 0
      order by 1 limit v_lim;
  end if;
end;
$$;


-- ── Site-wide headline numbers for the top of the page ────────────────────
create or replace function get_site_stats()
returns jsonb
language sql
security definer
set search_path = app_dev, pg_temp
stable
as $$
  select jsonb_build_object(
    'players',      (select count(*) from profiles),
    'games_played', (select coalesce(sum(played), 0) from game_stats where not imported),
    'played_today', (select count(*) from scores where day = dj_today()),
    'per_game',     (select coalesce(jsonb_object_agg(game, cnt), '{}'::jsonb)
                     from (select game, count(*) as cnt from scores
                           where day = dj_today() group by game) t)
  );
$$;


-- ── Grants ────────────────────────────────────────────────────────────────
-- Boards are readable signed out; that is what makes them worth sharing.
revoke all on function submit_score(text, int, jsonb, jsonb)  from public;
revoke all on function get_game_board(text, text, int)        from public;
revoke all on function get_site_stats()                       from public;

grant execute on function submit_score(text, int, jsonb, jsonb) to authenticated;
grant execute on function get_game_board(text, text, int)       to anon, authenticated;
grant execute on function get_site_stats()                      to anon, authenticated;

-- The 3-argument submit_score from 0001 is superseded by the 4-argument form.
drop function if exists submit_score(text, int, jsonb);
