// ═══════════════════════════════════════════════════════════════════════════
// DailyJamm - username check, claim and rename
//
// This function is the ONLY way a row reaches `profiles`. The table has RLS on
// with no client-writable policy, so the moderation filter cannot be skipped by
// calling the REST API with the publishable key. That is the whole point of
// putting it here instead of in assets/js.
//
// The filter itself lives in ./moderation.ts so it can be unit tested without a
// server: `deno test --allow-net moderation_test.ts`.
//
// Three actions:
//   { action: 'check', username } -> validate + availability. No write. No auth
//                                    required, so the field can respond as the
//                                    player types.
//   { action: 'claim', username } -> validate + create the profile. Requires a
//                                    valid JWT; the id comes from the token,
//                                    never from the request body.
//   { action: 'rename', username } -> same checks as claim, plus a cooldown.
//                                    A rename is the move someone makes to
//                                    dodge a report, so it is rate limited and
//                                    recorded in name_history.
//
// Deploy:  supabase functions deploy username
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';
import { moderate } from './moderation.ts';

// ── Environment → schema, decided by Origin, never by the caller ───────────
//
// The schema is deliberately NOT a request parameter. If the client could name
// its own schema, anyone could point the dev site at the production tables.
// Origin is set by the browser and cannot be forged by page script.
// Each environment answers on two hostnames: a custom subdomain and the raw
// workers.dev one. Exact matches first so tst.dailyjamm.com cannot be captured
// by a dailyjamm.com prefix rule.
const ORIGIN_SCHEMA: Record<string, string> = {
  'https://dailyjamm.com': 'public',
  'https://www.dailyjamm.com': 'public',
  'https://tst.dailyjamm.com': 'app_tst',
  'https://dev.dailyjamm.com': 'app_dev',
};
const ORIGIN_PREFIX: Array<[string, string]> = [
  ['https://dailyjammtest.', 'app_tst'],
  ['https://dailyjammdev.', 'app_dev'],
  ['http://localhost', 'app_dev'],
  ['http://127.0.0.1', 'app_dev'],
];

// The map above is shared by both deployments, so on its own it would let a
// localhost Origin reach the PRODUCTION function and ask for app_dev - a schema
// that does not exist there. That failed safe (a server error, no data) but it
// is the wrong answer: an origin from another environment should be refused
// outright, not fail deep in a query.
//
// DJ_SCHEMAS is set per project as a Supabase secret and lists the schemas that
// deployment is allowed to touch:
//   prod    -> "public"
//   nonprod -> "app_tst,app_dev"
// If the secret is missing we refuse everything rather than guess, so a
// misconfigured deploy is loud instead of quietly cross-wired.
const ALLOWED_SCHEMAS = new Set(
  (Deno.env.get('DJ_SCHEMAS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
);

function schemaFor(origin: string | null): string | null {
  if (!origin) return null;

  let schema: string | null = null;
  if (ORIGIN_SCHEMA[origin]) {
    schema = ORIGIN_SCHEMA[origin];
  } else {
    for (const [prefix, s] of ORIGIN_PREFIX) {
      if (origin.startsWith(prefix)) { schema = s; break; }
    }
  }
  if (!schema) return null;

  // Right shape of origin, wrong environment.
  return ALLOWED_SCHEMAS.has(schema) ? schema : null;
}

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '',
    // `apikey` is not optional: supabase-js and our own fetch both send it, and
    // a header missing from this list makes the browser block the request
    // before it leaves. curl ignores CORS entirely, so this class of bug
    // passes every command-line test and fails only in a real browser.
    // x-client-info is added by supabase-js on its own calls.
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// ── Handler ───────────────────────────────────────────────────────────────

// A rename is how someone escapes a report, so it is rate limited. Long
// enough to matter, short enough that a genuine regret is not permanent.
const RENAME_COOLDOWN_DAYS = 30;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TAKEN = 'That name is already taken - try another.';
const NOT_AVAILABLE = "That name isn't available - try another.";

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  const schema = schemaFor(origin);
  if (!schema) return json({ error: 'bad_origin' }, 403, origin);

  let body: { action?: string; username?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400, origin);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const action = body.action;

  if (action !== 'check' && action !== 'claim' && action !== 'rename') {
    return json({ error: 'bad_request' }, 400, origin);
  }

  const verdict = moderate(username);
  if (!verdict.ok) {
    // One message for every rejection reason. A filter that explains itself
    // teaches people how to beat it, and telling someone their surname is
    // profane is worse than telling them nothing.
    return json({ available: false, message: NOT_AVAILABLE }, 200, origin);
  }

  // Service key stays server-side. It bypasses RLS, which is exactly why it
  // must never be sent to a browser.
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    db: { schema },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const key = username.toLowerCase();

  // No generated types for this schema, so the row shape is declared here
  // rather than inferred as `never`.
  type ProfileRow = { id: string; username: string };
  const lookup = await db
    .from('profiles').select('id, username').eq('username_key', key).maybeSingle();
  if (lookup.error) return json({ error: 'server_error' }, 500, origin);
  const taken = lookup.data as unknown as ProfileRow | null;

  if (action === 'check') {
    return taken
      ? json({ available: false, reason: 'taken', message: TAKEN }, 200, origin)
      : json({ available: true }, 200, origin);
  }

  // The user id comes from the verified JWT. It is never read from the body -
  // that would let anyone create or rename a profile for someone else.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return json({ error: 'not_authenticated' }, 401, origin);

  const { data: userData, error: userErr } = await db.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'not_authenticated' }, 401, origin);
  const userId = userData.user.id;

  // Deliberately NOT a shared check. For a claim, any existing holder blocks
  // it. For a rename, the holder might be YOU - which is how a player fixes
  // their own capitalisation - so the rename branch tests the owner instead.
  if (action === 'claim' && taken) {
    return json({ available: false, reason: 'taken', message: TAKEN }, 200, origin);
  }

  // ── rename ──────────────────────────────────────────────────────────────
  if (action === 'rename') {
    // Taken by someone ELSE. Your own current name is not a conflict - it lets
    // a player fix their own capitalisation.
    if (taken && taken.id !== userId) {
      return json({ available: false, reason: 'taken', message: TAKEN }, 200, origin);
    }

    const cur = await db
      .from('profiles').select('username, renamed_at').eq('id', userId).maybeSingle();
    if (cur.error) return json({ error: 'server_error' }, 500, origin);
    const current = cur.data as unknown as { username: string; renamed_at: string | null } | null;
    if (!current) return json({ error: 'no_profile' }, 400, origin);

    if (current.username === username) {
      return json({ ok: true, username, unchanged: true }, 200, origin);
    }

    // Cooldown enforced in the WHERE clause, not by reading then writing, so
    // two requests cannot both pass the check.
    const cutoff = new Date(Date.now() - RENAME_COOLDOWN_DAYS * 86400000).toISOString();
    const upd = await db
      .from('profiles')
      .update({ username, username_key: key, renamed_at: new Date().toISOString() })
      .eq('id', userId)
      .or(`renamed_at.is.null,renamed_at.lt.${cutoff}`)
      .select('username, renamed_at');
    const updated = upd.data as unknown as Array<unknown> | null;
    const upErr = upd.error;

    if (upErr) {
      if (upErr.code === '23505') {
        return json({ available: false, reason: 'taken', message: TAKEN }, 200, origin);
      }
      return json({ error: 'server_error' }, 500, origin);
    }

    if (!updated || !updated.length) {
      // The cooldown clause matched nothing, so a rename is not due yet.
      // Only reachable when renamed_at is set - a null would have matched the
      // cooldown clause - but guard it rather than produce an Invalid Date.
      const since = current.renamed_at ? new Date(current.renamed_at).getTime() : Date.now();
      const nextAt = new Date(since + RENAME_COOLDOWN_DAYS * 86400000);
      return json({ available: false, reason: 'cooldown', next_at: nextAt.toISOString(),
                    message: 'You can change your name again on '
                             + nextAt.toISOString().slice(0, 10) + '.' }, 200, origin);
    }

    // Audit trail. Fire and forget - a missing history row must not fail a
    // rename the player has already been told succeeded.
    db.from('name_history').insert({
      user_id: userId, old_username: current.username, new_username: username,
    }).then(function () {}, function () {});

    return json({ ok: true, username, renamed: true }, 200, origin);
  }

  // ── claim ───────────────────────────────────────────────────────────────
  const { error: insertErr } = await db
    .from('profiles')
    .insert({ id: userId, username, username_key: key });

  if (insertErr) {
    // 23505 = unique violation: either the name was claimed a moment ago, or
    // this account already has a profile. Both are "pick another / you're
    // already set up", not a server fault.
    if (insertErr.code === '23505') {
      return json({ available: false, reason: 'taken', message: TAKEN }, 200, origin);
    }
    return json({ error: 'server_error' }, 500, origin);
  }

  return json({ ok: true, username }, 200, origin);
});
