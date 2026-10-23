-- GENERATED FROM 0015_boards_signed_in.sql - DO NOT EDIT BY HAND.
-- Target schema: public
-- Regenerate with ./generate.sh after changing the template.

-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - the leaderboards are for signed-in players. Template;
-- public must be substituted. Regenerate with ./generate.sh
--
-- The page no longer shows other players' standings to a visitor: signed out
-- it is the sign-in bar and nothing else, and it issues no RPC at all.
--
-- These functions were anon-executable for exactly one reason, recorded in
-- CLAUDE.md: "because the leaderboards page works signed out". That is no
-- longer true, so the grant becomes the only thing between a visitor and the
-- standings - and a grant is not a gate a client can enforce. Left in place it
-- would be cosmetic, one curl away, which is the argument already applied to
-- get_game_global and the Everyone tab.
--
-- WHAT THIS CHANGES FOR A SIGNED-IN PLAYER: nothing. `authenticated` keeps
-- EXECUTE on every one of them, and each already scopes its own figures to
-- auth.uid(). This removes a caller, not a capability.
--
-- WHY IT REVOKES BY NAME RATHER THAN BY SIGNATURE. Two reasons, and the
-- second is the important one:
--
--   1. get_game_board exists at two arities and only the 4-arg form is used.
--      Naming it once covers both without tracking which is which.
--
--   2. get_summary_v2 - the function this whole page is built on - is NOT
--      created by any migration in this repo. It is live in production and
--      called on every page load, so it was applied out of band, which means
--      these migrations are not a complete description of the schema. A
--      hand-written `revoke ... (text)` would be a guess at an argument list
--      nobody can read here, and would fail the whole migration if wrong.
--      Resolving pg_proc by name sidesteps that and keeps working if the
--      signature differs from what anyone assumes.
--
-- get_period_summary and get_my_lifetime are included even though they are
-- superseded and dead: they are still present, and a dead function with a
-- public grant is worse than a dead function. REVOKE is idempotent, so naming
-- them costs nothing if they are already locked.
--
-- dj_today() deliberately KEEPS anon. It returns the Chicago date and nothing
-- else, it is called from inside other definer functions, and the countdown a
-- signed-out player sees on every game page legitimately needs it.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public;

do $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('get_summary_v2', 'get_game_board', 'get_leaderboard',
                         'get_site_stats', 'get_period_summary', 'get_my_lifetime')
  loop
    -- Both grantees matter: `PUBLIC` is a different grantee from `anon`, and
    -- revoking one has never removed the other. That is the trap from 0010.
    execute format('revoke execute on function %s from anon',   r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    execute format('grant  execute on function %s to authenticated', r.sig);
    v_n := v_n + 1;
    raise notice 'locked to authenticated: %', r.sig;
  end loop;

  if v_n = 0 then
    raise exception 'matched no board functions in public - wrong schema, or they are named differently than expected';
  end if;
end $$;

-- Assert the result rather than trusting the revoke. 0010 and 0013 both
-- looked correct and were not.
do $$
declare v_leak text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_leak
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('get_summary_v2', 'get_game_board', 'get_leaderboard',
                       'get_site_stats', 'get_period_summary', 'get_my_lifetime')
     and has_function_privilege('anon', p.oid, 'execute');

  if v_leak is not null then
    raise exception 'anon can STILL execute: %', v_leak;
  end if;
  raise notice 'confirmed: anon cannot execute any board function in public';
end $$;
