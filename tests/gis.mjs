// Google Identity Services sign-in: does the button actually render?
//
//   node gis.mjs
//   node gis.mjs --base https://tst.dailyjamm.com
//   node gis.mjs --headed
//
// Sign-in itself cannot be driven - Google blocks automation, which is why
// session.mjs mints a JWT instead. What CAN be checked, and is where the real
// bugs were, is everything up to the click:
//
//   - Google's library loads past our CSP
//   - renderButton puts its iframe in the slot
//   - no CSP violation anywhere (GSI injects a stylesheet into the PARENT
//     document, which the first version of the CSP blocked; the button still
//     appeared, so it looked fine)
//   - there is exactly ONE sign-in affordance. A missing Authorized JavaScript
//     origin makes renderButton succeed and the button do nothing, which once
//     justified a permanent "having trouble?" link beside Google's button -
//     two buttons, where the quiet one led to the badly branded consent
//     screen. account.js now watches for Google's own log line instead, and
//     this test is the real guard.
//
// "origin is not allowed for the given client ID" is reported as PENDING, not
// as a failure: it means the code is right and the Google console still needs
// the environment's hostname added to the OAuth client.

import { chromium } from 'playwright';

const argOf = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const BASE = argOf('base', 'https://dev.dailyjamm.com');

// Cloudflare auto-injects this on the Worker sites and the CSP blocks it.
// Pre-existing, dev/tst only - production is GitHub Pages and never sees it -
// and we are not allowing a tracker we did not ask for.
const KNOWN_CSP = [/static\.cloudflareinsights\.com/];

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' :: ' + detail : ''}`); }
};

const b = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('dj_cookie_ok', '1');
    localStorage.setItem('dj_seen_release', '99.0.0');
  } catch (e) {}
});
const p = await ctx.newPage();

const csp = [], errs = [];
let originBlocked = false;
p.on('console', (m) => {
  const t = m.text();
  if (/GSI_LOGGER.*origin is not allowed/i.test(t)) { originBlocked = true; return; }
  if (/violates the following Content Security Policy|Refused to/i.test(t)) {
    if (!KNOWN_CSP.some((re) => re.test(t))) csp.push(t);
    return;
  }
  if (m.type() === 'error' && !/favicon|clarity|gtag|google-analytics|gsi\/log|\b40[13]\b/i.test(t)) errs.push(t);
});
p.on('pageerror', (e) => errs.push('UNCAUGHT: ' + e.message));

console.log(`\nGIS sign-in  ${BASE}\n`);
await p.goto(`${BASE}/chainlink/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForFunction(() => window.DJAccount, null, { timeout: 15000 });
await p.waitForTimeout(1500);

const cid = await p.evaluate(() => window.DJConfig && DJConfig.googleClientId);
check('a Google client ID is configured', !!cid && /\.apps\.googleusercontent\.com$/.test(cid), String(cid));

await p.evaluate(() => DJAccount.open());
await p.waitForTimeout(4000);

const r = await p.evaluate(() => {
  const slot = document.getElementById('dj-gis-btn');
  const fb = document.getElementById('dj-acct-fallback');
  const alt = document.getElementById('dj-acct-alt');
  return {
    slot: !!slot,
    iframe: !!(slot && slot.querySelector('iframe')),
    height: slot ? Math.round(slot.getBoundingClientRect().height) : -1,
    fallbackShown: !!(fb && !fb.hidden),
    altExists: !!alt,
    // Anything the player could read as "sign in with Google". Google's own
    // button is an iframe and has no text, so it is counted separately.
    googleWordedControls: [].slice.call(document.querySelectorAll('#dj-acct-body button'))
      .filter(function (el) {
        return el.offsetParent !== null && /sign in with google/i.test(el.textContent || '');
      }).length,
    gsi: !!(window.google && window.google.accounts && window.google.accounts.id),
  };
});

check("Google's library loaded", r.gsi === true);
check('the button slot exists', r.slot === true);
check('renderButton put an iframe in it', r.iframe === true, JSON.stringify(r));
check('the slot has real height', r.height >= 30, `height=${r.height}`);
check('the full fallback button stays hidden while GIS works', r.fallbackShown === false);
check('the old permanent "having trouble" link is gone', r.altExists === false);
check('exactly one sign-in affordance (Google\'s iframe, nothing else)',
  r.iframe === true && r.googleWordedControls === 0,
  `iframe=${r.iframe} extraButtons=${r.googleWordedControls}`);
check('no unexpected CSP violations', csp.length === 0, csp.slice(0, 2).join(' | '));
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await b.close();

if (originBlocked) {
  console.log('\n  PENDING  this origin is not on the OAuth client yet.');
  console.log('           Google Cloud Console -> Clients -> the web client ->');
  console.log(`           Authorized JavaScript origins -> add ${new URL(BASE).origin}`);
  console.log('           Until then the button renders but does nothing, which is');
  console.log('           what the fallback link covers.');
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
