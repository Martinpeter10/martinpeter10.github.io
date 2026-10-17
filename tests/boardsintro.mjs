// The one-time leaderboards spotlight.
//
//   node boardsintro.mjs
//
// Same contract as the favorites intro: shown once, dismissed forever. The
// cases that matter are the ones where it must NOT appear - a modal that
// comes back is worse than one nobody ever saw.

import { chromium } from 'playwright';

const argOf = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const BASE = argOf('base', 'https://dev.dailyjamm.com');

let pass = 0, fail = 0;
const check = (l, ok, d) => { if (ok) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}${d ? ' :: ' + d : ''}`); } };

const b = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });

/** @param seed what is already in localStorage before the page loads */
async function visit(path, seed, width) {
  const ctx = await b.newContext({ viewport: { width: width || 390, height: 844 } });
  // Seed ONCE. addInitScript runs on every navigation, so without this guard a
  // reload re-cleared dj_seen_boards_intro and the "never returns" check
  // failed against perfectly good code.
  await ctx.addInitScript((s) => {
    try {
      if (sessionStorage.getItem('__dj_seeded')) return;
      Object.keys(s).forEach((k) => s[k] === null ? localStorage.removeItem(k)
                                                  : localStorage.setItem(k, s[k]));
      sessionStorage.setItem('__dj_seeded', '1');
    } catch (e) {}
  }, Object.assign({ dj_cookie_ok: '1', dj_seen_release: '3.5.0' }, seed));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message));
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(2600);
  const r = await p.evaluate(() => {
    const bd = document.getElementById('dj-boards-intro');
    const t = document.getElementById('dj-boards-btn');
    const card = document.querySelector('.dj-bi-card');
    let aim = null;
    if (bd && t && card) {
      const tr = t.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const caret = parseFloat(getComputedStyle(card).getPropertyValue('--dj-bi-caret'));
      aim = Math.round((cr.right - caret) - (tr.left + tr.width / 2));
    }
    return {
      shown: !!bd,
      spotlit: !!(t && t.classList.contains('is-spotlit')),
      aimOffBy: aim,
      seen: localStorage.getItem('dj_seen_boards_intro'),
    };
  });
  return { ctx, p, r, errors };
}

console.log(`\nleaderboards intro  ${BASE}\n`);

// 1. A returning player who has seen the favorites intro gets it.
{
  const { ctx, p, r, errors } = await visit('/', { dj_seen_favs_intro: '1', dj_seen_boards_intro: null });
  check('returning player: it appears', r.shown === true);
  check('returning player: the real trophy is spotlit', r.spotlit === true);
  check('returning player: caret aims at the trophy centre',
    r.aimOffBy !== null && Math.abs(r.aimOffBy) <= 2, `off by ${r.aimOffBy}px`);
  check('returning player: not marked seen until dismissed', r.seen === null, String(r.seen));
  check('returning player: no uncaught errors', errors.length === 0, errors.join(' | '));

  // Dismiss, then reload - it must not come back.
  await p.evaluate(() => document.querySelector('.dj-bi-ok').click());
  await p.waitForTimeout(200);
  const after = await p.evaluate(() => ({
    gone: !document.getElementById('dj-boards-intro'),
    unspotlit: !document.getElementById('dj-boards-btn').classList.contains('is-spotlit'),
    seen: localStorage.getItem('dj_seen_boards_intro'),
  }));
  check('dismiss: removed and the spotlight cleared',
    after.gone && after.unspotlit, JSON.stringify(after));
  check('dismiss: flag written', after.seen === '1', String(after.seen));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  const again = await p.evaluate(() => !!document.getElementById('dj-boards-intro'));
  check('dismiss: never returns on reload', again === false);
  await ctx.close();
}

// 2. Already dismissed -> never shown.
{
  const { ctx, r } = await visit('/', { dj_seen_favs_intro: '1', dj_seen_boards_intro: '1' });
  check('already dismissed: stays away', r.shown === false);
  await ctx.close();
}

// 3. A brand-new visitor gets the FAVORITES intro first, not two at once.
{
  const { ctx, p, r } = await visit('/', { dj_seen_favs_intro: null, dj_seen_boards_intro: null });
  const favs = await p.evaluate(() => {
    const bd = document.getElementById('yf-intro-backdrop');
    return !!(bd && bd.classList.contains('open'));
  });
  check('first-ever visit: favorites intro shows', favs === true);
  check('first-ever visit: boards intro waits its turn', r.shown === false);
  await ctx.close();
}

// 4. Not on game pages - a modal over a game someone opened deliberately is worse.
{
  const { ctx, r } = await visit('/chainlink/', { dj_seen_favs_intro: '1', dj_seen_boards_intro: null });
  check('game page: stays away', r.shown === false);
  await ctx.close();
}

// 5. Narrowest phone: the caret still lands on the button.
{
  const { ctx, r } = await visit('/', { dj_seen_favs_intro: '1', dj_seen_boards_intro: null }, 375);
  check('375px: still aims at the trophy',
    r.shown && r.aimOffBy !== null && Math.abs(r.aimOffBy) <= 2, `off by ${r.aimOffBy}px`);
  await ctx.close();
}

await b.close();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
