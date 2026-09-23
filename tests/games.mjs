// Per-game gameplay tests, multiple cases each.
//
//   node games.mjs                       # every game, every case
//   node games.mjs --only chainlink      # one game
//   node games.mjs --case win            # one case
//   node games.mjs --headed              # watch it play
//
// Needs SB_TOKEN and DJ_PUBLISHABLE. Runs against dev.
//
// The cases below are written once and applied to every game module, because
// the bugs that actually shipped were not game-specific - they were in the
// shared paths: the score not reaching the database, extras counted twice on a
// first play, a replay reopening a finished day, a signed-out result being
// dropped instead of queued.

import { mintSession } from './session.mjs';
import * as L from './lib.mjs';

const MODULES = ['chainlink', 'spelldle'];

const only = L.argOf('only', null);
const onlyCase = L.argOf('case', null);

/** Read back everything the database should now hold for this game. */
async function stored(game, userId) {
  const [score] = await L.sql(
    `select score from ${L.SCHEMA}.scores where game='${game}' and user_id='${userId}' and day=${L.DAY};`);
  const [stats] = await L.sql(
    `select played, best, cur_streak, extras from ${L.SCHEMA}.game_stats where game='${game}' and user_id='${userId}';`);
  const [state] = await L.sql(
    `select complete from ${L.SCHEMA}.game_state where game='${game}' and user_id='${userId}' and day=${L.DAY};`);
  return { score: score?.score ?? null, stats: stats ?? null, complete: state?.complete ?? null };
}

function extrasMatch(actual, wanted) {
  return Object.keys(wanted).every((k) => String(actual?.[k]) === String(wanted[k]));
}

// ── The cases ────────────────────────────────────────────────────────────

async function caseOutcome(browser, mod, session, plan) {
  console.log(`\n  ${mod.id} / ${plan}`);
  await L.wipe(mod.id, session.userId);
  const ctx = await mod.today();
  const { ctx: bctx, page, errors } = await L.openGame(browser, mod.id, {
    session, clear: [...mod.keys],
  });
  await page.evaluate((k) => { try { localStorage.setItem(k, '1'); } catch (e) {} }, mod.seen);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await mod.ready(page);

  await mod.play(page, plan, ctx);
  await page.waitForTimeout(2500);

  const want = mod.expect(plan, ctx);

  // If a winning plan did not finish the game, the test's idea of today's
  // answer is wrong - a replicated puzzle rule has drifted from the game's.
  // Say that, rather than reporting the downstream "nothing was stored".
  if (plan.startsWith('win') && !(await mod.isComplete(page))) {
    L.check(`${plan}: game reached an end state`, false,
      'the computed answer did not win - this test\'s puzzle rule has drifted from the game');
    await bctx.close();
    return;
  }

  const shown = await mod.shownScore(page);
  if (shown !== null) {
    L.check(`${plan}: screen shows ${want.score}`, shown === want.score, `showed ${shown}`);
  }
  L.check(`${plan}: no uncaught errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await bctx.close();

  const db = await stored(mod.id, session.userId);
  L.check(`${plan}: score stored as ${want.score}`, db.score === want.score, `db=${db.score}`);
  L.check(`${plan}: counted one play`, db.stats?.played === 1, `played=${db.stats?.played}`);
  L.check(`${plan}: extras ${JSON.stringify(want.extras)}`,
    extrasMatch(db.stats?.extras, want.extras), JSON.stringify(db.stats?.extras));
  L.check(`${plan}: day marked complete`, db.complete === true, `complete=${db.complete}`);
}

/** Finishing then reloading must not double-count or reopen the day. */
async function caseReplay(browser, mod, session) {
  console.log(`\n  ${mod.id} / replay-after-finish`);
  await L.wipe(mod.id, session.userId);
  const ctx = await mod.today();

  const first = await L.openGame(browser, mod.id, { session, clear: [...mod.keys] });
  await first.page.evaluate((k) => localStorage.setItem(k, '1'), mod.seen);
  await first.page.reload({ waitUntil: 'domcontentloaded' });
  await mod.ready(first.page);
  await mod.play(first.page, 'win', ctx);
  await first.page.waitForTimeout(2500);
  const before = await stored(mod.id, session.userId);
  await first.ctx.close();

  // Reload twice: the restore path submits again, which must be a no-op.
  const second = await L.openGame(browser, mod.id, { session, clear: [] });
  await mod.ready(second.page).catch(() => {});
  await second.page.waitForTimeout(2500);
  await second.page.reload({ waitUntil: 'domcontentloaded' });
  await second.page.waitForTimeout(2500);
  await second.ctx.close();

  const after = await stored(mod.id, session.userId);
  L.check('replay: score unchanged', after.score === before.score, `${before.score} -> ${after.score}`);
  L.check('replay: played still 1', after.stats?.played === 1, `played=${after.stats?.played}`);
  L.check('replay: extras not double-counted',
    JSON.stringify(after.stats?.extras) === JSON.stringify(before.stats?.extras),
    `${JSON.stringify(before.stats?.extras)} -> ${JSON.stringify(after.stats?.extras)}`);
}

/** Signed out must queue, never submit - and never reach the boards. */
async function caseSignedOut(browser, mod, userId) {
  console.log(`\n  ${mod.id} / signed-out`);
  await L.wipe(mod.id, userId);
  const ctx = await mod.today();

  const { ctx: bctx, page, errors } = await L.openGame(browser, mod.id, {
    session: null, clear: [...mod.keys],
  });
  await page.evaluate((k) => localStorage.setItem(k, '1'), mod.seen);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await mod.ready(page);
  await mod.play(page, 'win', ctx);
  await page.waitForTimeout(2500);

  const queued = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('dj_score_queue')) || []; }
    catch (e) { return []; }
  });
  const synced = await page.evaluate(() => window.DJStore?.debug()?.synced);

  L.check('signed-out: no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  L.check('signed-out: not syncing state', synced === false, `synced=${synced}`);
  L.check('signed-out: result queued locally',
    queued.some((q) => q.game === mod.id), JSON.stringify(queued).slice(0, 120));
  await bctx.close();

  const db = await stored(mod.id, userId);
  L.check('signed-out: nothing reached the database', db.score === null, `db=${db.score}`);
}

// ── Runner ───────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.SB_TOKEN) throw new Error('SB_TOKEN not set');
  const session = await mintSession();
  console.log(`gameplay tests  ${L.BASE}  as ${session.email}`);

  const browser = await L.launch();
  try {
    for (const name of MODULES) {
      if (only && only !== name) continue;
      const mod = await import(`./games/${name}.mjs`);

      const plans = name === 'chainlink' ? ['win', 'half', 'lose'] : ['win', 'win3', 'lose'];
      for (const plan of plans) {
        if (onlyCase && onlyCase !== plan) continue;
        await caseOutcome(browser, mod, session, plan);
      }
      if (!onlyCase || onlyCase === 'replay')     await caseReplay(browser, mod, session);
      if (!onlyCase || onlyCase === 'signed-out') await caseSignedOut(browser, mod, session.userId);

      await L.wipe(mod.id, session.userId);   // leave nothing behind for the real player
    }
  } finally {
    await browser.close();
  }
  process.exit(L.summary());
}

main().catch((e) => { console.error(e); process.exit(1); });
