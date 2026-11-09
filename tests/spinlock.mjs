// Roulettedle: the table stays locked from Spin until it has been cleared.
//
//   node spinlock.mjs
//   node spinlock.mjs --base http://localhost:8080 --headed
//
// The bug: settleSpin() unlocked the board the moment the ball landed, but the
// table is only cleared ~2.2s later. Tapping numbers in that gap stacked chips
// onto the bets just paid AND re-enabled Spin; a spin started there then had its
// bets wiped mid-air by the pending cleanup.
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

  // Wait for the ball to land: the result banner appears.
  await page.waitForSelector('#rl-spin-result:not(.hidden)', { timeout: 10000 });
  await page.click('[data-bet="num-5"]', { force: true });
  await page.click('[data-bet="num-8"]', { force: true });
  check('no bet while the result is showing', await bet() === placed, `${placed} -> ${await bet()}`);
  check('Spin stays disabled while the result is showing',
    await page.isDisabled('#rl-spin-btn'));
  check('Clear stays disabled while the result is showing',
    await page.isDisabled('#rl-clear-bets'));

  // Once the table clears, betting works again.
  await page.waitForSelector('#rl-spin-result.hidden', { state: 'attached', timeout: 10000 });
  await page.waitForTimeout(200);
  check('table is cleared', await bet() === '0', await bet());
  await page.click('[data-bet="num-5"]');
  check('betting reopens after the table clears', await bet() !== '0', await bet());
  check('Spin re-enables once a new bet is placed', !(await page.isDisabled('#rl-spin-btn')));
  check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
} finally { await browser.close(); }
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
