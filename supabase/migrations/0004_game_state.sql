-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - server-owned game state. Template; __SCHEMA__ must be
-- substituted. Regenerate with ./generate.sh
--
-- Two tables because the lifetimes differ. Daily state expires at midnight;
-- a chip stack must not. Conflating them is how a stack gets wiped by a date
-- rollover.
--
-- Signed in, the server is truth. Nothing merges: on first sign-in the player
-- starts at base values and their localStorage chips are discarded, because an
-- imported stack can be whatever devtools says it is.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = __SCHEMA__;

-- ── Per day, per game ─────────────────────────────────────────────────────
-- `state` is the game's own "today" object, stored verbatim. The server does
-- not interpret it; only `complete` has meaning here.
create table if not exists game_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  game       text not null references game_defs(game),
  day        date not null,
  state      jsonb not null,
  complete   boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, game, day)
);

-- ── Cumulative, survives the date rollover ────────────────────────────────
create table if not exists progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  game       text not null references game_defs(game),
  chips      int,
  bonus_day  date,                                  -- last daily bonus granted
  extra      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

alter table game_state enable row level security;
alter table progress   enable row level security;

drop policy if exists game_state_read_own on game_state;
create policy game_state_read_own on game_state
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists progress_read_own on progress;
create policy progress_read_own on progress
  for select to authenticated using (auth.uid() = user_id);

-- Reads go through the RPC, but granting select keeps the policies meaningful
-- and lets a future client read directly without another migration.
grant select on game_state to authenticated;
grant select on progress   to authenticated;
revoke insert, update, delete on game_state from anon, authenticated;
revoke insert, update, delete on progress   from anon, authenticated;
grant all on game_state to service_role;
grant all on progress   to service_role;


-- ── get_game_state ────────────────────────────────────────────────────────
-- Returns today's state plus cumulative progress in one round trip, because
-- the client blocks the game's first paint on this call.
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
    'bonus_day', v_pr.bonus_day
  );
end;
$$;


-- ── save_game_state ───────────────────────────────────────────────────────
-- Every argument is optional so a caller can update just the chip stack, or
-- just today's state, without reading the rest first.
--
-- `complete` is a one-way latch. Once a day is finished it cannot be reopened,
-- which is what stops a second device resurrecting a finished day and what
-- makes a late offline write safe to drop.
create or replace function save_game_state(
  p_game      text,
  p_state     jsonb default null,
  p_complete  boolean default null,
  p_chips     int default null,
  p_bonus_day date default null
)
returns jsonb
language plpgsql
security definer
set search_path = __SCHEMA__, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_day  date := dj_today();
  v_was  boolean;
begin
  if v_user is null then
    return jsonb_build_object('saved', false, 'reason', 'not_authenticated');
  end if;
  if not exists (select 1 from game_defs where game = p_game) then
    return jsonb_build_object('saved', false, 'reason', 'unknown_game');
  end if;
  if p_state is not null and pg_column_size(p_state) > 32768 then
    return jsonb_build_object('saved', false, 'reason', 'state_too_large');
  end if;

  if p_state is not null or p_complete is not null then
    select complete into v_was from game_state
     where user_id = v_user and game = p_game and day = v_day;

    -- Refuse to reopen a finished day. A queued offline write arriving after
    -- completion is dropped rather than rewinding the board.
    if coalesce(v_was, false) and coalesce(p_complete, false) = false then
      return jsonb_build_object('saved', false, 'reason', 'already_complete');
    end if;

    insert into game_state (user_id, game, day, state, complete, updated_at)
    values (v_user, p_game, v_day,
            coalesce(p_state, '{}'::jsonb), coalesce(p_complete, false), now())
    on conflict (user_id, game, day) do update set
      state      = coalesce(p_state, game_state.state),
      complete   = game_state.complete or coalesce(p_complete, false),
      updated_at = now();
  end if;

  if p_chips is not null or p_bonus_day is not null then
    insert into progress (user_id, game, chips, bonus_day, updated_at)
    values (v_user, p_game, p_chips, p_bonus_day, now())
    on conflict (user_id, game) do update set
      chips      = coalesce(p_chips, progress.chips),
      bonus_day  = coalesce(p_bonus_day, progress.bonus_day),
      updated_at = now();
  end if;

  return jsonb_build_object('saved', true, 'day', v_day);
end;
$$;


revoke all on function get_game_state(text)                          from public;
revoke all on function save_game_state(text, jsonb, boolean, int, date) from public;
grant execute on function get_game_state(text)                          to authenticated;
grant execute on function save_game_state(text, jsonb, boolean, int, date) to authenticated;
