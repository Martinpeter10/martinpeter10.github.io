// Roulettedle: the betting area is locked from Spin until the ball lands.
//
//   node spinlock.mjs
//   node spinlock.mjs --base http://localhost:8080 --headed
//
// The bug: settleSpin() unlocked the board the moment the ball landed, but the
// table is only cleared ~2.2s later. Tapping numbers in that gap stacked chips
// onto the bets just paid AND re-enabled Spin; a spin started there then had its
// bets wiped mid-air by the pending cleanup.
//
// Now: the table is cleared at the moment the ball lands, then unlocked, so a
// tap during the result banner starts a fresh bet that nothing later wipes.
//
// Signed out on purpose - localStorage is the whole mechanism under test.

import { chromium } from 'playwright';

const argOf = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const BASE = argOf('base', 'https://dev.dailyjamm.com');

let pass = 0, fail = 0;
const check = (l, ok, d) => { if (ok) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}${d ? ' :: ' + d : ''}`); } };

const browser = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
console.log(`\nroulettedle spin lock  ${BASE}`);
try {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('dj_cookie_ok', '1');
      localStorage.setItem('dj_seen_release', '99.0.0');
      localStorage.setItem('rl_seen_howto', '1');
      const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      localStorage.setItem('rl_bonus_date', d);
    } catch (e) {}
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message));
  await page.goto(`${BASE}/roulettedle/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.DJStore && DJStore.debug().opened === true,
    null, { timeout: 15000 });
  await page.waitForTimeout(800);
  for (const id of ['rl-daily-close', 'rl-modal-close']) {
    const el = await page.$('#' + id);
    if (el && await el.isVisible()) await el.click().catch(() => {});
  }

  const bet = () => page.textContent('#rl-total-bet').then((s) => s.trim());

  await page.click('[data-bet="num-17"]');
  const placed = await bet();
  await page.click('#rl-spin-btn');

  // Hammer the board while the wheel is turning.
  await page.waitForTimeout(1000);
  await page.click('[data-bet="num-5"]', { force: true });
  check('no bet while the wheel turns', await bet() === placed, `${placed} -> ${await bet()}`);

  check('betting area is visibly locked while the wheel turns',
    await page.evaluate(() => document.getElementById('rl-bet-area').classList.contains('rl-locked')));
  check('Clear is disabled while the wheel turns', await page.isDisabled('#rl-clear-bets'));

  // The ball lands: the result banner appears, the table is cleared and unlocked.
  await page.waitForSelector('#rl-spin-result:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(100);
  check('table is cleared as the ball lands', await bet() === '0', await bet());
  check('betting area unlocks as the ball lands',
    await page.evaluate(() => !document.getElementById('rl-bet-area').classList.contains('rl-locked')));

  // A bet placed while the result is still showing starts fresh...
  await page.click('[data-bet="num-5"]');
  const fresh = await bet();
  check('a bet placed during the result starts a fresh table', fresh === placed, `${fresh} (expected ${placed})`);
  check('Spin re-enables once a new bet is placed', !(await page.isDisabled('#rl-spin-btn')));

  // ...and survives the banner tidying itself away.
  await page.waitForSelector('#rl-spin-result.hidden', { state: 'attached', timeout: 10000 });
  await page.waitForTimeout(200);
  check('that bet survives the result banner closing', await bet() === fresh, `${fresh} -> ${await bet()}`);
  check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
} finally { await browser.close(); }
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
