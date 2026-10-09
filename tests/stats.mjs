// Cross-device lifetime stats.
//
//   node stats.mjs
//   node stats.mjs --only chainlink --headed
//
// This is the suite for the bug that prompted it: a day played on a desktop,
// then a sign-in on a phone. The phone was correctly told it had already
// played today - game_state was doing its job - and then showed an empty stats
// modal, because the *_stats_v2 keys were never account state.
//
// It deliberately does NOT play a game. Gameplay is covered by games.mjs; what
// is under test here is the hydrate/seed/overwrite contract in store.js, and
// priming localStorage directly is the only way to assert on a known blob.

import { mintSession } from './session.mjs';
import * as L from './lib.mjs';

// game id -> the stats keys DJStore tracks for it, and a blob to prime with.
// Shapes differ per game on purpose: the whole point of storing them verbatim
// is that the server never has to know what is inside.
const GAMES = {
  chainlink: {
    keys: ['cl_stats_v2'],
    blob: { cl_stats_v2: { played: 7, best: 4, streak: 2, totalScore: 103, perfectGames: 1 } },
    other: { cl_stats_v2: { played: 1, best: 1, streak: 1, totalScore: 11, perfectGames: 0 } },
  },
  holdle: {
    // Three keys, which is the case that breaks if they do not travel together.
    keys: ['hd_stats_v2', 'hd_alltime_v2', 'hd_ai_stats_v3'],
    blob: {
      hd_stats_v2:    { played: 5, best: 3, streak: 1 },
      hd_alltime_v2:  { biggestWin: 820, biggestLoss: -400, totalNet: 310 },
      hd_ai_stats_v3: { 0: { w: 2, l: 1, f: 0, af: 1 } },
    },
    other: { hd_stats_v2: { played: 1, best: 1, streak: 1 } },
  },
};

const only = L.argOf('only', null);

async function serverStats(game, userId) {
  const [row] = await L.sql(
    `select stats from ${L.SCHEMA}.progress where game='${game}' and user_id='${userId}';`);
  return row ? row.stats : null;
}

async function clearServerStats(game, userId) {
  await L.sql(
    `update ${L.SCHEMA}.progress set stats = null
      where game='${game}' and user_id='${userId}';`);
}

/** Load the game page with a given localStorage stats blob already in place. */
async function visit(browser, game, { session, prime, clearKeys }) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(([sess, blob, keys]) => {
    try {
      localStorage.setItem('dj_cookie_ok', '1');
      localStorage.setItem('dj_seen_release', '99.0.0');
      keys.forEach((k) => localStorage.removeItem(k));
      if (blob) Object.keys(blob).forEach((k) => localStorage.setItem(k, JSON.stringify(blob[k])));
      if (sess) localStorage.setItem(sess.key, sess.value);
      else Object.keys(localStorage).filter((k) => k.startsWith('sb-'))
             .forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
  }, [session || null, prime || null, clearKeys]);

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message));
  await page.goto(`${L.BASE}/${game}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // The gate is what guarantees hydration finished before the game read its
  // stats, so wait on the same signal the game does.
  await page.waitForFunction(() => window.DJStore && DJStore.debug().opened === true,
    null, { timeout: 15000 });
  await page.waitForTimeout(1500);        // let the 400ms stats write land

  const local = await page.evaluate((keys) => {
    const out = {};
    keys.forEach((k) => {
      const raw = localStorage.getItem(k);
      if (raw !== null) { try { out[k] = JSON.parse(raw); } catch (e) { out[k] = raw; } }
    });
    return out;
  }, clearKeys);
  const synced = await page.evaluate(() => DJStore.debug().synced);

  await ctx.close();
  return { local, synced, errors };
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

async function run(browser, game, g, session) {
  console.log(`\n  ${game}`);
  await clearServerStats(game, session.userId);

  // ── 1. First device seeds the account ──────────────────────────────────
  // Chips reset to base on first sign-in; stats must NOT, or creating an
  // account throws away a player's whole history.
  const a = await visit(browser, game, { session, prime: g.blob, clearKeys: g.keys });
  L.check('seed: no uncaught errors', a.errors.length === 0, a.errors.slice(0, 2).join(' | '));
  L.check('seed: page is syncing', a.synced === true, `synced=${a.synced}`);
  L.check('seed: local stats left alone', same(a.local, g.blob),
    JSON.stringify(a.local));

  const seeded = await serverStats(game, session.userId);
  L.check('seed: account now holds the blob', same(seeded, g.blob), JSON.stringify(seeded));

  // ── 2. Second device gets them ─────────────────────────────────────────
  // This is the reported bug, as a test.
  const b = await visit(browser, game, { session, prime: null, clearKeys: g.keys });
  L.check('second device: no uncaught errors', b.errors.length === 0, b.errors.slice(0, 2).join(' | '));
  L.check('second device: stats hydrated from the account', same(b.local, g.blob),
    JSON.stringify(b.local));

  // ── 3. The account wins over whatever the browser had ──────────────────
  const c = await visit(browser, game, { session, prime: g.other, clearKeys: g.keys });
  L.check('conflict: account blob replaced the local one', same(c.local, g.blob),
    JSON.stringify(c.local));

  const afterConflict = await serverStats(game, session.userId);
  L.check('conflict: a stale device did not overwrite the account',
    same(afterConflict, g.blob), JSON.stringify(afterConflict));

  // ── 4. A fresh install cannot blank the account ────────────────────────
  // p_merge is what stops this: the phone has nothing, so if seeding were
  // unconditional it would push an empty blob over the desktop's history.
  const d = await visit(browser, game, { session, prime: null, clearKeys: g.keys });
  const afterFresh = await serverStats(game, session.userId);
  L.check('fresh install: account history intact', same(afterFresh, g.blob),
    JSON.stringify(afterFresh));
  L.check('fresh install: device shows the account history', same(d.local, g.blob),
    JSON.stringify(d.local));

  // ── 5. Signed out, nothing is adopted and nothing is sent ──────────────
  const e = await visit(browser, game, { session: null, prime: g.other, clearKeys: g.keys });
  L.check('signed-out: not syncing', e.synced === false, `synced=${e.synced}`);
  L.check('signed-out: browser keeps its own stats', same(e.local, g.other),
    JSON.stringify(e.local));
  const afterOut = await serverStats(game, session.userId);
  L.check('signed-out: account untouched', same(afterOut, g.blob), JSON.stringify(afterOut));

  await clearServerStats(game, session.userId);
}

async function main() {
  if (!process.env.SB_TOKEN) throw new Error('SB_TOKEN not set');
  const session = await mintSession();
  console.log(`cross-device stats  ${L.BASE}  as ${session.email}`);

  const browser = await L.launch();
  try {
    for (const game of Object.keys(GAMES)) {
      if (only && only !== game) continue;
      await run(browser, game, GAMES[game], session);
    }
  } finally {
    await browser.close();
  }
  process.exit(L.summary());
}

main().catch((e) => { console.error(e); process.exit(1); });
