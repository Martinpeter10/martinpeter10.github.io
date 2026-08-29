// ═══════════════════════════════════════════════════════════════════════════
// DailyJamm - username check + claim
//
// This function is the ONLY way a row reaches `profiles`. The table has RLS on
// with no client-writable policy, so the moderation filter below cannot be
// skipped by calling the REST API with the publishable key. That is the whole
// point of putting it here instead of in assets/js.
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
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'npm:obscenity@0.4.3';

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

function schemaFor(origin: string | null): string | null {
  if (!origin) return null;
  if (ORIGIN_SCHEMA[origin]) return ORIGIN_SCHEMA[origin];
  for (const [prefix, schema] of ORIGIN_PREFIX) {
    if (origin.startsWith(prefix)) return schema;
  }
  return null;
}

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// ── Moderation ────────────────────────────────────────────────────────────

const SHAPE = /^[A-Za-z0-9_]{3,16}$/;

// Only digits and _ can actually reach here (SHAPE runs first), but the map is
// complete so the normaliser stays correct if the shape rule is ever relaxed.
const LEET: Record<string, string> = {
  '4': 'a', '@': 'a', '^': 'a',
  '8': 'b', 'ß': 'b',
  '(': 'c', '¢': 'c', '©': 'c',
  '3': 'e', '€': 'e',
  '6': 'g', '9': 'g',
  '1': 'i', '!': 'i', '|': 'i',
  '0': 'o', '°': 'o',
  '$': 's', '5': 's', '§': 's',
  '7': 't', '+': 't',
  '2': 'z',
};

/**
 * Fold a name down to a comparison key.
 *   @$$h0l3  -> asshole
 *   f_u_c_k  -> fuck
 *   a55      -> ass
 * Returns three keys, all of which get checked:
 *
 *   stripped   full leet substitution      a55     -> ass
 *   collapsed  runs of a repeat folded     fuuuck  -> fuck
 *   suffixed   trailing digits dropped     Fuck2   -> fuck
 *
 * The third exists because trailing digits are the most common thing in a
 * username and substituting them is over-eager - Peter2 folds to "peterz",
 * which is noise at best and a manufactured false positive at worst. Dropping
 * the suffix gives a clean "peter" alongside it. Checking more keys can only
 * ever add a rejection, never remove one, so this strictly improves the catch
 * rate without widening what gets through.
 */
function normalise(input: string): { stripped: string; collapsed: string; suffixed: string } {
  const fold = (raw: string) => {
    let s = raw.toLowerCase();
    s = s.normalize('NFKD').replace(/\p{M}/gu, '');     // strip accents
    s = s.replace(/vv/g, 'w').replace(/ph/g, 'f');
    s = [...s].map((ch) => LEET[ch] ?? ch).join('');
    return s.replace(/[^a-z]/g, '');
  };

  const stripped = fold(input);
  const collapsed = stripped.replace(/(.)\1{2,}/g, '$1');
  const suffixed = fold(input.replace(/[0-9_]+$/, ''));
  return { stripped, collapsed, suffixed };
}

// The engine carries the wordlist, with confusable and leetspeak transformers
// of its own. Hand-maintaining a slur list is work you get wrong forever.
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Whole-key matches only. These are names nobody should be able to hold, not
// profanity - a substring rule here would reject "administrator_pete".
const RESERVED = new Set([
  'admin', 'administrator', 'mod', 'moderator', 'support', 'staff', 'system',
  'official', 'root', 'null', 'undefined', 'anonymous', 'guest', 'me', 'you',
  'dailyjamm', 'daily_jamm', 'jamm',
  'themedle', 'chainlink', 'blackjackdle', 'spelldle', 'roulettedle', 'holdle',
  'liarsdice', 'netzero', 'shutthebox', 'yachtdle',
]);

type Verdict = { ok: true } | { ok: false; reason: string };

function moderate(username: string): Verdict {
  if (!SHAPE.test(username)) {
    // This is where @$$ dies - as invalid characters, before any wordlist runs.
    return { ok: false, reason: 'shape' };
  }
  const { stripped, collapsed, suffixed } = normalise(username);
  if (stripped.length < 2) return { ok: false, reason: 'shape' };

  if (RESERVED.has(stripped) || RESERVED.has(username.toLowerCase())) {
    return { ok: false, reason: 'reserved' };
  }
  // obscenity carries the word-boundary assertions that keep "Cassandra" and
  // "Bassmaster" out of the soft-list crossfire. Do not replace it with a
  // plain substring scan over a hand-written list.
  for (const key of [stripped, collapsed, suffixed]) {
    if (key.length >= 2 && matcher.hasMatch(key)) return { ok: false, reason: 'blocked' };
  }
  return { ok: true };
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
