// The "Everyone" tab in every game's stats modal.
//
//   node globalstats.mjs
//   node globalstats.mjs --only themedle --headed
//
// Signed out, which is now the interesting case: the Everyone tab is a
// SIGN-IN INCENTIVE, so what it must do here is show the pitch, never the
// figures, and never call the server at all. The grant is `authenticated`
// alone, so a leak would also 401 - but a tab that fires a doomed request on
// every open is still wrong, and only the network log shows it.
//
// Ten games, one module, and the per-game differences come from game_defs, so
// what is worth testing per game is that each modal mounts it and that the
// tab behaves.

import { chromium } from 'playwright';

const argOf = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const BASE = argOf('base', 'https://dev.dailyjamm.com');
const only = argOf('only', null);

// game -> [how to open its stats modal, the container the tab attaches to]
const GAMES = [
  ['themedle',     'td-stats-btn',   'td-stats-content'],
  ['chainlink',    'cl-stats-btn',   'cl-stats-content'],
  ['spelldle',     'spd-stats-btn',  'spd-stats-content'],
  ['blackjackdle', 'bj-stats-btn',   'bj-stats-content'],
  ['roulettedle',  'rl-history-btn', 'rl-hist-own'],
  ['holdle',       'hd-stats-btn',   'hd-stats-content'],
  ['liarsdice',    'bf-stats-btn',   'bf-stats-content'],
  ['netzero',      'sb-stats-btn',   'sb-stats-content'],
  ['shutthebox',   'stb-stats-btn',  'stb-stats-content'],
  ['yachtdle',     'yc-stats-btn',   'yc-stats-content'],
];

let pass = 0, fail = 0;
const check = (l, ok, d) => { if (ok) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}${d ? ' :: ' + d : ''}`); } };

const b = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
console.log(`\nglobal stats tab  ${BASE}  (signed out)\n`);

for (const [game, btnId, contentId] of GAMES) {
  if (only && only !== game) continue;
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.addInitScript((g) => {
    try {
      localStorage.setItem('dj_cookie_ok', '1');
      localStorage.setItem('dj_seen_release', '99.0.0');
      ['td', 'cl', 'spd', 'bj', 'rl', 'hd', 'bf', 'sb', 'stb', 'yc']
        .forEach((p) => localStorage.setItem(p + '_seen_howto', '1'));
      const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      ['bj', 'rl', 'hd'].forEach((p) => localStorage.setItem(p + '_bonus_date', d));
    } catch (e) {}
  }, game);

  const page = await ctx.newPage();
  const errors = [];
  const rpcCalls = [];
  page.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message));
  page.on('request', (r) => {
    if (/\/rpc\/get_game_global/.test(r.url())) rpcCalls.push(r.url());
  });
  await page.goto(`${BASE}/${game}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.DJStore && DJStore.debug().opened === true,
    null, { timeout: 15000 });
  await page.waitForTimeout(900);

  // Some games open a welcome modal over the header; clear whatever is there.
  for (const id of ['bj-daily-close', 'rl-daily-close', 'hd-daily-close',
                    'bj-modal-close', 'rl-modal-close', 'hd-modal-close']) {
    const el = await page.$('#' + id);
    if (el && await el.isVisible()) await el.click().catch(() => {});
  }
  await page.waitForTimeout(300);

  await page.click('#' + btnId, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(700);

  const mounted = await page.evaluate((cid) => {
    const c = document.getElementById(cid);
    if (!c) return { noContent: true };
    const prev = c.previousElementSibling;
    return {
      tabs: !!(prev && prev.classList.contains('dj-g-tabs')),
      tabCount: prev ? prev.querySelectorAll('.dj-g-tab').length : 0,
      panelHidden: (() => { const p = document.querySelector('.dj-g-panel'); return p ? p.hidden : null; })(),
    };
  }, contentId);

  check(`${game}: tab bar mounted beside the player's own stats`,
    mounted.tabs === true && mounted.tabCount === 2, JSON.stringify(mounted));
  check(`${game}: the Everyone panel starts hidden`, mounted.panelHidden === true,
    String(mounted.panelHidden));

  // Each game titles its modal differently - "My Stats", "Spin History" -
  // so the assertion is that it CHANGES and then comes back, not that it
  // matches a fixed string.
  const headBefore = await page.evaluate(() => {
    const bar = document.querySelector('.dj-g-tabs');
    const h = bar && bar.parentNode.querySelector('h2');
    return h ? h.textContent.trim() : null;
  });

  // Switch to Everyone and wait for the fetch.
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.dj-g-tab')].find((e) => /everyone/i.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(2500);

  const shown = await page.evaluate((cid) => {
    const p = document.querySelector('.dj-g-panel');
    const own = document.getElementById(cid);
    return {
      panelVisible: p ? !p.hidden : false,
      ownHidden: own ? own.hidden : null,
      text: p ? (p.textContent || '').trim().slice(0, 140) : '',
      pitch: !!(p && p.querySelector('.dj-g-pitch-btn')),
      rows: p ? p.querySelectorAll('.dj-g-row').length : 0,
      bars: p ? p.querySelectorAll('.dj-g-bar-row').length : 0,
      loading: p ? /Loading/.test(p.textContent || '') : false,
      periods: document.querySelectorAll('.dj-g-period').length,
    };
  }, contentId);

  check(`${game}: panel shown and own stats hidden`,
    shown.panelVisible === true && shown.ownHidden === true, JSON.stringify(shown));
  check(`${game}: signed out, it shows the sign-in pitch`, shown.pitch === true, shown.text);
  check(`${game}: signed out, no figures leak`,
    shown.rows === 0 && shown.bars === 0, `rows=${shown.rows} bars=${shown.bars}`);
  check(`${game}: signed out, the server is never called`,
    rpcCalls.length === 0, `${rpcCalls.length} request(s)`);
  check(`${game}: it is not stuck loading`, shown.loading === false, shown.text);
  check(`${game}: no period toggle - today only`, shown.periods === 0,
    `${shown.periods} period buttons`);

  // Share Stats shares the player's own stats; it must not sit under
  // everyone else's.
  const share = await page.evaluate(() => {
    const bar = document.querySelector('.dj-g-tabs');
    if (!bar) return null;
    const btns = [].slice.call(bar.parentNode.querySelectorAll('button[id*="share"]'));
    return { total: btns.length, visible: btns.filter((b) => !b.hidden).length };
  });
  check(`${game}: Share Stats is hidden on the Everyone tab`,
    share && share.total > 0 && share.visible === 0, JSON.stringify(share));
  check(`${game}: no uncaught errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

  // The modal is headed "My Stats"; it must not say that over everyone's
  // numbers, and it must say it again on the way back.
  const heads = await page.evaluate(() => {
    const h = document.querySelector('.dj-g-tabs') &&
              document.querySelector('.dj-g-tabs').parentNode.querySelector('h2');
    return h ? h.textContent.trim() : null;
  });
  check(`${game}: heading no longer says these are the player's own`,
    heads !== null && heads !== headBefore, `${headBefore} -> ${heads}`);

  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.dj-g-tab')].find((e) => /^you$/i.test(e.textContent.trim()));
    if (t) t.click();
  });
  await page.waitForTimeout(300);
  const back = await page.evaluate((cid) => {
    const h = document.querySelector('.dj-g-tabs').parentNode.querySelector('h2');
    const own = document.getElementById(cid);
    const p = document.querySelector('.dj-g-panel');
    return { head: h ? h.textContent.trim() : null, ownHidden: own ? own.hidden : null,
             panelHidden: p ? p.hidden : null };
  }, contentId);
  check(`${game}: switching back restores the player's own view`,
    back.ownHidden === false && back.panelHidden === true && back.head === headBefore,
    `${JSON.stringify(back)} expected head "${headBefore}"`);

  // The one phrase the leaderboards page was pulled up on.
  const bad = await page.evaluate(() => {
    const p = document.querySelector('.dj-g-panel');
    return p ? /best\s+(guesses|tiles|distance|session)/i.test(p.textContent || '') : false;
  });
  check(`${game}: no "best <unit>" phrasing`, bad === false);

  check(`${game}: the pitch opens the account modal`, await (async () => {
    await page.evaluate(() => {
      const b = document.querySelector('.dj-g-pitch-btn');
      if (b) b.click();
    });
    await page.waitForTimeout(600);
    const open = await page.evaluate(() => {
      const m = document.getElementById('dj-acct-modal');
      return !!(m && m.classList.contains('open'));
    });
    await page.evaluate(() => { if (window.DJAccount) DJAccount.close(); });
    await page.waitForTimeout(200);
    return open;
  })());

  await ctx.close();
}

await b.close();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
