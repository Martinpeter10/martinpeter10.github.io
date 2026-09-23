// DailyJamm browser smoke tests.
//
// Drives the real Chrome already on this machine (channel: 'chrome') against a
// live environment. Not part of the site: `tests` is excluded from the GitHub
// Pages build by _config.yml and from the Cloudflare upload by .assetsignore,
// and node_modules is gitignored.
//
//   node smoke.mjs                      # dev, signed out
//   node smoke.mjs --signed-in          # dev, with an injected session
//   node smoke.mjs --base https://...   # any environment
//   node smoke.mjs --headed             # watch it happen
//
// WHY THIS EXISTS: several bugs shipped today that a browser would have caught
// immediately - a CORS preflight rejection, a ReferenceError from a script
// ordering assumption, a gate that could fail to open. curl cannot see any of
// those. This can.

import { chromium } from 'playwright';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? dflt : (process.argv[i + 1] ?? true);
};
const has = (name) => process.argv.includes('--' + name);

const BASE = arg('base', 'https://dev.dailyjamm.com');
const HEADED = has('headed');
const SIGNED_IN = has('signed-in');

const GAMES = [
  'themedle', 'chainlink', 'spelldle', 'blackjackdle', 'roulettedle',
  'holdle', 'liarsdice', 'netzero', 'shutthebox', 'yachtdle',
];
const OTHER = ['', 'leaderboards', 'about', 'releases', 'terms', 'privacy'];

// Console noise that is expected and not a failure.
const IGNORE = [
  /favicon/i,
  /googletagmanager|google-analytics|clarity/i,   // blocked without consent
  /Failed to load resource.*(analytics|gtag|clarity)/i,
];

let pass = 0, fail = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  failures.push(`${label}${detail ? ' :: ' + detail : ''}`);
}

async function visit(browser, path, opts = {}) {
  const ctx = await browser.newContext();
  if (opts.session) {
    // supabase-js v2 persists under sb-<ref>-auth-token. Injecting it makes the
    // page believe it is signed in without going through Google, which blocks
    // automation outright.
    await ctx.addInitScript(
      ([key, value]) => { try { localStorage.setItem(key, value); } catch (e) {} },
      [opts.session.key, opts.session.value],
    );
  }
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORE.some((re) => re.test(t))) return;
    errors.push(t);
  });
  page.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message));

  const url = `${BASE}/${path}${path ? '/' : ''}`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // The gate is async; give it a moment to open before judging the page.
  await page.waitForTimeout(opts.settle ?? 2500);

  const state = await page.evaluate(() => ({
    hasHeader: !!document.querySelector('header.site-header'),
    bodyText: (document.body.innerText || '').trim().length,
    store: window.DJStore ? window.DJStore.debug() : null,
    account: window.DJAccount ? window.DJAccount.debug() : null,
    accountBtn: !!document.getElementById('dj-account-btn'),
    boardsBtn: !!document.getElementById('dj-boards-btn'),
  }));

  await ctx.close();
  return { status: res?.status(), errors, state, url };
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: !HEADED });

  let session = null;
  if (SIGNED_IN) {
    const mod = await import('./session.mjs');
    session = await mod.mintSession();
    console.log(`  using injected session for ${session.email}\n`);
  }

  console.log(`DailyJamm smoke  ${BASE}  (${SIGNED_IN ? 'signed in' : 'signed out'})\n`);

  for (const path of [...OTHER, ...GAMES]) {
    const label = path || '(home)';
    const r = await visit(browser, path, { session });

    check(`${label} status`, r.status === 200, `got ${r.status}`);
    check(`${label} no console errors`, r.errors.length === 0, r.errors.slice(0, 2).join(' | '));
    check(`${label} rendered`, r.state.bodyText > 200, `only ${r.state.bodyText} chars of text`);
    check(`${label} header present`, r.state.hasHeader);

    if (GAMES.includes(path)) {
      // The gate must ALWAYS open. A gate that does not is a blank game.
      check(`${label} store gate opened`, r.state.store?.opened === true,
        `verdict: ${r.state.store?.verdict}`);
      if (SIGNED_IN) {
        check(`${label} syncing`, r.state.store?.synced === true,
          `verdict: ${r.state.store?.verdict}`);
      } else {
        check(`${label} not syncing when signed out`, r.state.store?.synced === false);
      }
    }

    const mark = r.errors.length === 0 && r.status === 200 ? 'ok  ' : 'FAIL';
    const extra = GAMES.includes(path) ? `  gate=${r.state.store?.opened} synced=${r.state.store?.synced}` : '';
    console.log(`  ${mark} ${label.padEnd(14)}${extra}`);
    if (r.errors.length) r.errors.slice(0, 3).forEach((e) => console.log(`       ! ${e.slice(0, 160)}`));
  }

  await browser.close();

  console.log(`\n  ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach((f) => console.log('   - ' + f));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
