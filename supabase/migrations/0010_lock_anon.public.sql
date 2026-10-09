-- GENERATED FROM 0010_lock_anon.sql - DO NOT EDIT BY HAND.
-- Target schema: public
-- Regenerate with ./generate.sh after changing the template.

-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - close anon's execute privilege on the private functions.
-- Template; public must be substituted. Regenerate with ./generate.sh
--
-- THE TRAP
-- Every migration so far ended with `revoke all on function ... from public`,
-- which looks like it closes the door. In a schema we created it does. In the
-- `public` schema it does NOT: Supabase ships `alter default privileges in
-- schema public grant execute on functions to anon, authenticated`, so each
-- function got an EXPLICIT anon grant at creation time, and revoking from the
-- PUBLIC pseudo-role leaves that grant untouched.
--
-- Result: on production, `anon` could execute save_game_state, save_game_stats,
-- submit_score, get_game_state, get_my_stats and get_my_rank. Not exploitable
-- today - every one of them starts with `if auth.uid() is null then refuse`,
-- and the read ones scope to auth.uid() so they return nothing - but it is one
-- missing guard away from being exploitable, and it is not the posture the
-- design claims. `app_dev` and `app_tst` were correct all along, which is
-- exactly why this went unnoticed: it cannot be reproduced outside prod.
--
-- Checked with, per schema:
--   select p.proname, has_function_privilege('anon', p.oid, 'execute')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = '<schema>';
--
-- The board and site-stats functions deliberately KEEP anon: the leaderboards
-- page works signed out, and that is the point of it.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public;

-- Looped rather than written out, because the revoke has to name the exact
-- argument list and these functions have been replaced at several arities
-- (get_game_board still exists as both a 3-arg and a 4-arg form). Looping over
-- pg_proc also makes the migration idempotent and safe where a function was
-- never created in this schema - get_my_lifetime only ever existed in app_dev.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'get_game_state',
         'save_game_state',
         'save_game_stats',
         'submit_score',
         'get_my_stats',
         'get_my_rank',
         'get_my_lifetime'
       )
  loop
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    execute format('grant  execute on function %s to authenticated', r.sig);
  end loop;
end
$$;

-- Stop the next function added to this schema from repeating it. Applies to
-- objects created by the role running this migration, which is the role the
-- migrations run as - a function created by hand in the dashboard as a
-- different role would still pick up the old default.
alter default privileges in schema public revoke execute on functions from anon;
