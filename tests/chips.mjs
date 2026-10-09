// Chip-game tests: BlackJackdle, Roulettedle, Holdle.
//
//   node chips.mjs                    # all chip games
//   node chips.mjs --only blackjackdle
//   node chips.mjs --headed
//
// These games are NOT date-seeded - the deck and the daily bonus both use
// Math.random() - so there is no outcome to predict. The test asserts
// SCREEN MATCHES DATABASE instead, which is the wiring that was never verified:
//
//   session net shown  ==  scores.score
//   final stack shown  ==  progress.chips  ==  extras.chips_now
//   bonus claimed      ==  progress.bonus_day
//   day finished       ==  game_state.complete
//
// A wrong sign or a stale write here costs a player real winnings, so this is
// the suite worth having even though it cannot predict a number.

import { mintSession } from './session.mjs';
import * as L from './lib.mjs';

const MODULES = ['blackjackdle'];
const only = L.argOf('only', null);

async function dbState(game, userId) {
  const [score] = await L.sql(
    `select score from ${L.SCHEMA}.scores where game='${game}' and user_id='${userId}' and day=${L.DAY};`);
  const [stats] = await L.sql(
    `select played, extras from ${L.SCHEMA}.game_stats where game='${game}' and user_id='${userId}';`);
  const [prog] = await L.sql(
    `select chips, bonus_day from ${L.SCHEMA}.progress where game='${game}' and user_id='${userId}';`);
  const [state] = await L.sql(
    `select complete from ${L.SCHEMA}.game_state where game='${game}' and user_id='${userId}' and day=${L.DAY};`);
  return { score: score?.score ?? null, stats: stats ?? null, prog: prog ?? null,
           complete: state?.complete ?? null };
}

async function wipeChips(game, userId) {
  await L.wipe(game, userId);
  await L.sql(`delete from ${L.SCHEMA}.progress where game='${game}' and user_id='${userId}';`);
}

/** Play a full session signed in, then check the database agrees with the screen. */
async function caseSession(browser, mod, session) {
  console.log(`\n  ${mod.id} / full session, signed in`);
  await wipeChips(mod.id, session.userId);

  const { ctx, page, errors } = await L.openGame(browser, mod.id, {
    session, clear: [...mod.keys],
  });
  await page.evaluate((k) => { try { localStorage.setItem(k, '1'); } catch (e) {} }, mod.seen);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await mod.ready(page);

  const synced = await page.evaluate(() => window.DJStore?.debug()?.synced);
  L.check('session: store is syncing', synced === true, `synced=${synced}`);

  // Starting stack must come from the server, not the browser. A first sign-in
  // has no server chips, so the game seeds its own base.
  const startChips = await page.evaluate(() => {
    const el = document.getElementById('bj-chips');
    return el ? parseInt(el.textContent.replace(/[^0-9-]/g, ''), 10) : null;
  });
  L.check('session: started from a base stack', startChips !== null && startChips >= 1000,
    `start=${startChips}`);

  await mod.play(page, 'min');
  const shown = await mod.screen(page);
  L.check('session: reached an end state', shown.finished === true, JSON.stringify(shown));
  L.check('session: no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  // Give the debounced state write time to land before reading.
  await page.waitForTimeout(3500);
  await ctx.close();

  const db = await dbState(mod.id, session.userId);
  console.log(`       screen: net=${shown.net} chips=${shown.finalChips} broke=${shown.broke}`);
  console.log(`       db:     score=${db.score} chips=${db.prog?.chips} extras=${JSON.stringify(db.stats?.extras)}`);

  L.check('session: score stored', db.score !== null, 'no score row');
  if (shown.net !== null && db.score !== null) {
    L.check('session: stored score == session net on screen',
      db.score === shown.net, `db=${db.score} screen=${shown.net}`);
  }
  L.check('session: counted one play', db.stats?.played === 1, `played=${db.stats?.played}`);
  L.check('session: chips persisted to progress', db.prog?.chips !== null && db.prog?.chips !== undefined,
    `chips=${db.prog?.chips}`);
  if (shown.finalChips !== null) {
    L.check('session: progress.chips == final stack on screen',
      db.prog?.chips === shown.finalChips, `db=${db.prog?.chips} screen=${shown.finalChips}`);
    L.check('session: extras.chips_now == final stack',
      Number(db.stats?.extras?.chips_now) === shown.finalChips,
      `extras=${db.stats?.extras?.chips_now} screen=${shown.finalChips}`);
  }
  L.check('session: daily bonus recorded server-side', !!db.prog?.bonus_day, `bonus_day=${db.prog?.bonus_day}`);
  L.check('session: day marked complete', db.complete === true, `complete=${db.complete}`);
  return db;
}

/**
 * The bonus was farmable: it was gated on localStorage, so clearing site data
 * re-granted it. Signed in it must be granted once per day, full stop.
 */
async function caseBonusNotFarmable(browser, mod, session) {
  console.log(`\n  ${mod.id} / daily bonus cannot be farmed`);
  const before = await dbState(mod.id, session.userId);
  if (!before.prog?.bonus_day) {
    L.check('bonus: a bonus was claimed in the session above', false, 'nothing to test against');
    return;
  }

  // Wipe local storage entirely - the old exploit - and reload signed in.
  const { ctx, page } = await L.openGame(browser, mod.id, {
    session, clear: [...mod.keys],
  });
  await page.evaluate((k) => localStorage.setItem(k, '1'), mod.seen);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await mod.ready(page);
  await page.waitForTimeout(2500);

  const chipsAfterClear = await page.evaluate(() => {
    const el = document.getElementById('bj-chips');
    return el ? parseInt(el.textContent.replace(/[^0-9-]/g, ''), 10) : null;
  });
  await ctx.close();

  const after = await dbState(mod.id, session.userId);
  L.check('bonus: server still shows one claim today',
    after.prog?.bonus_day === before.prog?.bonus_day,
    `${before.prog?.bonus_day} -> ${after.prog?.bonus_day}`);
  L.check('bonus: stack not inflated by clearing storage',
    after.prog?.chips === before.prog?.chips,
    `${before.prog?.chips} -> ${after.prog?.chips} (screen showed ${chipsAfterClear})`);
}

/** Signed out, a chip game must not touch the account's stack. */
async function caseSignedOut(browser, mod, userId) {
  console.log(`\n  ${mod.id} / signed out does not touch the account`);
  const before = await dbState(mod.id, userId);

  const { ctx, page, errors } = await L.openGame(browser, mod.id, {
    session: null, clear: [...mod.keys],
  });
  await page.evaluate((k) => localStorage.setItem(k, '1'), mod.seen);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await mod.ready(page);
  const synced = await page.evaluate(() => window.DJStore?.debug()?.synced);
  await mod.play(page, 'min');
  await page.waitForTimeout(2500);
  await ctx.close();

  const after = await dbState(mod.id, userId);
  L.check('signed-out: no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  L.check('signed-out: not syncing', synced === false, `synced=${synced}`);
  L.check('signed-out: account chips untouched',
    after.prog?.chips === before.prog?.chips, `${before.prog?.chips} -> ${after.prog?.chips}`);
  L.check('signed-out: account score untouched',
    after.score === before.score, `${before.score} -> ${after.score}`);
}

async function main() {
  if (!process.env.SB_TOKEN) throw new Error('SB_TOKEN not set');
  const session = await mintSession();
  console.log(`chip-game tests  ${L.BASE}  as ${session.email}`);

  const browser = await L.launch();
  try {
    for (const name of MODULES) {
      if (only && only !== name) continue;
      const mod = await import(`./games/${name}.mjs`);
      await caseSession(browser, mod, session);
      await caseBonusNotFarmable(browser, mod, session);
      await caseSignedOut(browser, mod, session.userId);
      await wipeChips(mod.id, session.userId);
    }
  } finally {
    await browser.close();
  }
  process.exit(L.summary());
}

main().catch((e) => { console.error(e); process.exit(1); });
