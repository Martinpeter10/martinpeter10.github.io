// Shared harness for gameplay tests.
//
// Every game module exports the same shape, so the standard cases below are
// written once rather than per game:
//
//   id        game id in game_defs and DJStore
//   keys      localStorage keys to clear for a fresh board
//   today()   resolve today's answer/solution from the same rule the game uses
//   play(page, plan, ctx)  drive the board to an outcome
//   expect(plan, ctx)      { score, extras } the database should end up with

import { chromium } from 'playwright';

export const BASE   = argOf('base', 'https://dev.dailyjamm.com');
export const REF    = process.env.DJ_REF    || 'uyvozabvhhaqhypnquzd';
export const SCHEMA = process.env.DJ_SCHEMA || 'app_dev';

export function has(n) { return process.argv.includes('--' + n); }
export function argOf(n, d) {
  const i = process.argv.indexOf('--' + n);
  return i === -1 ? d : process.argv[i + 1];
}

// The games stamp rows with the Chicago date. Postgres current_date is UTC, and
// for five hours every evening those are different days - a query using the
// wrong one silently finds nothing and looks like a broken app.
export const DAY = `${SCHEMA}.dj_today()`;

export async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

/**
 * Scoped to the test account. Never pass a real player's id - these tests
 * delete rows, and an unscoped wipe destroys real play data.
 */
export async function wipe(game, userId) {
  if (!userId) throw new Error('wipe() needs the test user id - refusing to delete unscoped');
  await sql(`delete from ${SCHEMA}.scores      where game='${game}' and user_id='${userId}';
             delete from ${SCHEMA}.game_stats  where game='${game}' and user_id='${userId}';
             delete from ${SCHEMA}.game_state  where game='${game}' and user_id='${userId}';`);
}

export function fetchJSON(path) {
  return fetch(`${BASE}${path}`).then((r) => r.json());
}

/** Day index the daily games derive their puzzle from. */
export function chicagoParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: +m.year, month: +m.month, day: +m.day };
}

/**
 * COPIED EXACTLY from assets/js/spelldle.js. It is a variant, not canonical
 * mulberry32: the accumulator is unsigned (>>> 0, not | 0) and the second
 * mix ends with | 0 rather than ^ t. Using the textbook version instead
 * produced a different answer every day, and the test reported it as a
 * storage failure rather than as its own bug.
 *
 * If the game's RNG ever changes, this must change with it - the guard in
 * games.mjs is what makes that failure loud.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Reporting ────────────────────────────────────────────────────────────
export const results = { pass: 0, fail: 0, failed: [] };

export function check(label, ok, detail) {
  if (ok) { results.pass++; console.log(`    ok   ${label}`); }
  else {
    results.fail++;
    results.failed.push(label);
    console.log(`    FAIL ${label}${detail ? ' :: ' + detail : ''}`);
  }
}

// ── Browser ──────────────────────────────────────────────────────────────
export async function launch() {
  return chromium.launch({ channel: 'chrome', headless: !has('headed') });
}

/**
 * A page with optional signed-in session and a cleared board.
 * signedOut pages deliberately get no session so queueing can be tested.
 */
export async function openGame(browser, game, { session, clear = [], path }) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(([sess, keys]) => {
    try {
      localStorage.setItem('dj_cookie_ok', '1');
      localStorage.setItem('dj_seen_release', '99.0.0');   // keep the bell out of the way
      keys.forEach((k) => localStorage.removeItem(k));
      if (sess) localStorage.setItem(sess.key, sess.value);
      else Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
  }, [session || null, clear]);

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|clarity|gtag|google-analytics/i.test(t)) return;
    errors.push(t);
  });

  await page.goto(`${BASE}/${path || game}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { ctx, page, errors };
}

export function summary() {
  console.log(`\n  ${results.pass} passed, ${results.fail} failed`);
  if (results.failed.length) results.failed.forEach((f) => console.log('   - ' + f));
  return results.fail ? 1 : 0;
}
