// Reloading mid-round must RESUME, never refund.
//
//   node redo.mjs
//   node redo.mjs --only roulettedle --headed
//
// The exploit: all three chip games deducted the stake in memory only and
// persisted nothing until the round resolved, so reloading whenever a hand
// looked bad handed the stake back and re-dealt. These games feed the chip
// leaderboards.
//
// Signed out on purpose - no credentials needed, and localStorage is the whole
// mechanism under test.

import { chromium } from 'playwright';

const argOf = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const BASE = argOf('base', 'https://dev.dailyjamm.com');
const only = argOf('only', null);

let pass = 0, fail = 0;
const check = (l, ok, d) => { if (ok) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}${d ? ' :: ' + d : ''}`); } };

const num = (s) => (s == null ? null : parseInt(String(s).replace(/[^0-9-]/g, ''), 10));

async function fresh(browser, game, seen) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.addInitScript((k) => {
    try {
      localStorage.setItem('dj_cookie_ok', '1');
      localStorage.setItem('dj_seen_release', '99.0.0');
      localStorage.setItem(k, '1');                 // skip the how-to modal
      // Skip the daily-bonus modal: claim it for today up front.
      const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      localStorage.setItem(k.replace('_seen_howto', '_bonus_date'), d);
    } catch (e) {}
  }, seen);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message));
  await page.goto(`${BASE}/${game}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.DJStore && DJStore.debug().opened === true,
    null, { timeout: 15000 });
  await page.waitForTimeout(800);
  return { ctx, page, errors };
}

async function roulettedle(browser) {
  console.log('\n  roulettedle');
  const { ctx, page, errors } = await fresh(browser, 'roulettedle', 'rl_seen_howto');

  // Dismiss anything modal that still managed to open.
  for (const id of ['rl-daily-close', 'rl-modal-close']) {
    const el = await page.$('#' + id);
    if (el && await el.isVisible()) await el.click().catch(() => {});
  }
  await page.waitForTimeout(400);

  const before = num(await page.textContent('#rl-chips'));
  const spinBefore = await page.textContent('#rl-spin-indicator');

  // A single-number bet: 37/38 a loss, so the stack must move either way.
  await page.click('[data-bet="num-17"]');
  await page.waitForTimeout(200);
  const staked = before - num(await page.textContent('#rl-chips'));
  const betShown = staked === 0;   // some builds only deduct on spin

  await page.click('#rl-spin-btn');
  await page.waitForTimeout(1100);          // mid-animation, ball still moving

  const liveSaved = await page.evaluate(() => {
    try { return !!(JSON.parse(localStorage.getItem('rl_today')) || {}).live; }
    catch (e) { return false; }
  });
  check('spin is written down before it is shown', liveSaved === true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.DJStore && DJStore.debug().opened === true,
    null, { timeout: 15000 });
  await page.waitForTimeout(2500);

  const after = num(await page.textContent('#rl-chips'));
  const spinAfter = await page.textContent('#rl-spin-indicator');
  const stillLive = await page.evaluate(() => {
    try { return !!(JSON.parse(localStorage.getItem('rl_today')) || {}).live; }
    catch (e) { return false; }
  });
  const savedChips = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('rl_chips')); } catch (e) { return null; }
  });

  console.log(`       chips ${before} -> ${after} (saved ${savedChips}); ${spinBefore.trim()} -> ${spinAfter.trim()}`);
  check('the stake was not handed back', after !== before, `${before} -> ${after}`);
  check('the spin was consumed, not re-offered', spinAfter !== spinBefore,
    `${spinBefore} -> ${spinAfter}`);
  check('the live spin is settled and cleared', stillLive === false);
  check('screen and saved stack agree', after === savedChips, `${after} vs ${savedChips}`);
  check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  await ctx.close();
}

async function blackjackdle(browser) {
  console.log('\n  blackjackdle');
  const { ctx, page, errors } = await fresh(browser, 'blackjackdle', 'bj_seen_howto');
  for (const id of ['bj-daily-close', 'bj-modal-close']) {
    const el = await page.$('#' + id);
    if (el && await el.isVisible()) await el.click().catch(() => {});
  }
  await page.waitForTimeout(400);

  const before = num(await page.textContent('#bj-chips'));
  const handBefore = (await page.textContent('#bj-hand-num')).trim();

  // Place a bet and deal.
  await page.click('.bj-bet-chip:not(.bj-bet-allin)');
  await page.waitForTimeout(250);
  let staked = before - num(await page.textContent('#bj-chips'));
  await page.click('#bj-bet-deal');
  // Let the deal finish and the action buttons appear.
  await page.waitForSelector('#bj-actions:not(.hidden)', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);

  const midChips = num(await page.textContent('#bj-chips'));
  const live = await page.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('bj_today')) || {}).live || null; }
    catch (e) { return null; }
  });
  check('the dealt hand is written down', !!(live && live.playerHand && live.playerHand.length === 2),
    JSON.stringify(live && { phase: live.phase, p: (live.playerHand || []).length }));
  check('the deck is saved with it, so the dealer cannot be re-rolled',
    !!(live && Array.isArray(live.deck) && live.deck.length > 0),
    `deck=${live && live.deck && live.deck.length}`);
  const handShown = live ? live.playerHand.map((c) => c.rank + c.suit[0]).join(' ') : '';

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.DJStore && DJStore.debug().opened === true,
    null, { timeout: 15000 });
  await page.waitForTimeout(2000);

  const after = num(await page.textContent('#bj-chips'));
  const resumed = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#bj-player-cards .bj-card-slot')];
    return {
      playerCards: cards.length,
      betArea: !!document.querySelector('#bj-bet-area:not(.hidden)'),
      actions: !!document.querySelector('#bj-actions:not(.hidden)'),
    };
  });
  const liveAfter = await page.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('bj_today')) || {}).live || null; }
    catch (e) { return null; }
  });
  const sameHand = liveAfter
    ? liveAfter.playerHand.map((c) => c.rank + c.suit[0]).join(' ') : '';

  console.log(`       chips ${before} -> ${midChips} (staked ${staked}) -> ${after} after reload`);
  console.log(`       hand "${handShown}" -> "${sameHand}"`);
  check('the stake was not handed back', after === midChips, `${midChips} -> ${after}`);
  check('the betting table was NOT offered again', resumed.betArea === false);
  check('the same cards came back', sameHand === handShown || resumed.actions === false,
    `${handShown} vs ${sameHand}`);
  check('the hand is playable again', resumed.playerCards >= 2, `cards=${resumed.playerCards}`);
  check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  await ctx.close();
}

async function holdle(browser) {
  console.log('\n  holdle');
  const { ctx, page, errors } = await fresh(browser, 'holdle', 'hd_seen_howto');
  for (const id of ['hd-daily-close', 'hd-modal-close']) {
    const el = await page.$('#' + id);
    if (el && await el.isVisible()) await el.click().catch(() => {});
  }
  await page.waitForTimeout(400);

  const before = num(await page.textContent('#hd-chips'));
  await page.click('.hd-bet-chip:not(.hd-bet-allin)');
  await page.waitForTimeout(250);
  await page.click('#hd-bet-deal');

  // Wait for the player to actually have the action: AIs post and act first.
  await page.waitForSelector('#hd-actions:not(.hidden)', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(700);

  const midChips = num(await page.textContent('#hd-chips'));
  const live = await page.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('hd_today')) || {}).live || null; }
    catch (e) { return null; }
  });
  check('the hand is written down', !!(live && live.playerHole && live.playerHole.length === 2),
    JSON.stringify(live && { street: live.street, pot: live.pot, toCall: live.toCall }));
  check('the deck is saved, so the board cannot be re-dealt',
    !!(live && Array.isArray(live.deck) && live.deck.length > 0));
  check('the RNG position is saved, so the opponents stay the same players',
    !!(live && typeof live.rngCalls === 'number'), `rngCalls=${live && live.rngCalls}`);
  check('every opponent stack is saved', !!(live && (live.ais || []).length === 3));
  const holeBefore = live ? live.playerHole.map((c) => c.rank + c.suit[0]).join(' ') : '';
  const potBefore = live ? live.pot : -1;

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.DJStore && DJStore.debug().opened === true,
    null, { timeout: 15000 });
  await page.waitForTimeout(2500);

  const after = num(await page.textContent('#hd-chips'));
  const r = await page.evaluate(() => {
    let live = null;
    try { live = (JSON.parse(localStorage.getItem('hd_today')) || {}).live || null; } catch (e) {}
    return {
      betArea: !!document.querySelector('#hd-bet-area:not(.hidden)'),
      cards: document.querySelectorAll('#hd-player-cards .hd-card').length
             || document.querySelectorAll('#hd-player-cards > *').length,
      hole: live ? live.playerHole.map((c) => c.rank + c.suit[0]).join(' ') : '',
      pot: live ? live.pot : -1,
    };
  });

  console.log(`       chips ${before} -> ${midChips} -> ${after} after reload`);
  console.log(`       hole "${holeBefore}" -> "${r.hole}"; pot ${potBefore} -> ${r.pot}`);
  check('the ante was not handed back', after === midChips, `${midChips} -> ${after}`);
  check('the betting table was NOT offered again', r.betArea === false);
  check('the same hole cards came back', r.hole === holeBefore, `${holeBefore} vs ${r.hole}`);
  check('the pot survived', r.pot === potBefore, `${potBefore} -> ${r.pot}`);
  check('the hand is on the table', r.cards >= 2, `cards=${r.cards}`);
  check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  await ctx.close();
}

const b = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
console.log(`\nmid-round reload  ${BASE}`);
try {
  if (!only || only === 'roulettedle') await roulettedle(b);
  if (!only || only === 'blackjackdle') await blackjackdle(b);
  if (!only || only === 'holdle') await holdle(b);
} finally { await b.close(); }
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
