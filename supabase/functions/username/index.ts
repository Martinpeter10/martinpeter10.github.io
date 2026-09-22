// ═══════════════════════════════════════════════════════════════════════════
// DailyJamm - username check + claim
//
// This function is the ONLY way a row reaches `profiles`. The table has RLS on
// with no client-writable policy, so the moderation filter cannot be skipped by
// calling the REST API with the publishable key. That is the whole point of
// putting it here instead of in assets/js.
//
// The filter itself lives in ./moderation.ts so it can be unit tested without a
// server: `deno test --allow-net moderation_test.ts`.
//
// Two actions:
//   { action: 'check', username } -> validate + availability. No write. No auth
//                                    required, so the field can respond as the
//                                    player types.
//   { action: 'claim', username } -> validate + create the profile. Requires a
//                                    valid JWT; the id comes from the token,
//                                    never from the request body.
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
const ORIGIN_SCHEMA: Record<string, string> = {
  'https://dailyjamm.com': 'public',
  'https://www.dailyjamm.com': 'public',
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
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// ── Handler ───────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

  if (action !== 'check' && action !== 'claim') {
    return json({ error: 'bad_request' }, 400, origin);
  }

  const verdict = moderate(username);
  if (!verdict.ok) {
    // One message for every rejection reason. A filter that explains itself
    // teaches people how to beat it, and telling someone their surname is
    // profane is worse than telling them nothing.
    return json({ available: false, message: "That name isn't available - try another." }, 200, origin);
  }

  // Service key stays server-side. It bypasses RLS, which is exactly why it
  // must never be sent to a browser.
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    db: { schema },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const key = username.toLowerCase();

  const { data: taken, error: lookupErr } = await db
    .from('profiles').select('id').eq('username_key', key).maybeSingle();
  if (lookupErr) return json({ error: 'server_error' }, 500, origin);

  if (action === 'check') {
    return taken
      ? json({ available: false, message: "That name isn't available - try another." }, 200, origin)
      : json({ available: true }, 200, origin);
  }

  // ── claim ───────────────────────────────────────────────────────────────
  // The user id comes from the verified JWT. It is never read from the body -
  // that would let anyone create a profile for anyone else's account.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return json({ error: 'not_authenticated' }, 401, origin);

  const { data: userData, error: userErr } = await db.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'not_authenticated' }, 401, origin);
  const userId = userData.user.id;

  if (taken) {
    return json({ available: false, message: "That name isn't available - try another." }, 200, origin);
  }

  const { error: insertErr } = await db
    .from('profiles')
    .insert({ id: userId, username, username_key: key });

  if (insertErr) {
    // 23505 = unique violation: either the name was claimed a moment ago, or
    // this account already has a profile. Both are "pick another / you're
    // already set up", not a server fault.
    if (insertErr.code === '23505') {
      return json({ available: false, message: "That name isn't available - try another." }, 200, origin);
    }
    return json({ error: 'server_error' }, 500, origin);
  }

  return json({ ok: true, username }, 200, origin);
});
