-- GENERATED FROM 0013_hardening.sql - DO NOT EDIT BY HAND.
-- Target schema: app_dev
-- Regenerate with ./generate.sh after changing the template.

-- ═══════════════════════════════════════════════════════════════════════════
-- DailyJamm - close the gaps a security sweep found. Template; app_dev
-- must be substituted. Regenerate with ./generate.sh
--
-- None of these were exploitable. All three are the difference between "RLS
-- happens to stop it" and "it is stopped twice", which is what the design
-- claims and what the next change should be able to rely on.
--
-- 1. game_defs had INSERT/UPDATE/DELETE granted to anon and authenticated.
--    The table-level twin of the function trap in 0010: Supabase's default
--    privileges in `public` grant tables to those roles, and game_defs was
--    the one table whose migration granted SELECT without revoking the rest.
--    RLS blocked the writes - every policy is SELECT-only, and no policy for
--    a command means deny - and that was verified by actually trying an
--    UPDATE and an INSERT as a signed-in user, not by reading the policies.
--    But the grant should not be there.
--
-- 2. anon could SELECT game_state and progress. The policies are
--    authenticated-only so anon reads nothing, but `scores` and `game_stats`
--    revoke it and these two did not. Same posture everywhere.
--
-- 3. dj_today() had a mutable search_path, flagged by Supabase's own linter.
--    It is called from inside every security-definer function, so it is worth
--    pinning even though it only reads a timezone.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = app_dev;

revoke insert, update, delete on game_defs from anon, authenticated;
revoke select on game_state from anon;
revoke select on progress   from anon;

-- Only needs pg_catalog: it reads now() in a fixed timezone.
alter function dj_today() set search_path = pg_catalog, pg_temp;
