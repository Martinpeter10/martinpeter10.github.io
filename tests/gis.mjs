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
//   - there is exactly ONE sign-in affordance, measured by what RENDERS rather
//     than by the `hidden` property. Checking `el.hidden` is what let the
//     two-button bug ship: the property was perfectly true while the element
//     was on screen, because an author `display` rule beats the browser's own
//     [hidden]{display:none}.
//
// "origin is not allowed for the given client ID" is reported as PENDING, not
// as a failure: it means the code is right and the Google console still needs
// the environment's hostname added to the OAuth client.

import { chromium } from 'playwright';

const argOf = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const BASE = argOf('base', 'https://dev.dailyjamm.com');

// BOTH kinds of page, and that is the whole point.
//
// This suite used to check /chainlink/ only, and missed a two-buttons bug that
// appeared on every page WITHOUT Tailwind. Game pages load the Tailwind CDN,
// whose preflight re-declares [hidden]{display:none} as author CSS; that
// masked an author rule of ours which was overriding `hidden`. The home and
// info pages have no Tailwind, so there the hidden fallback button rendered.
// A game page therefore proves nothing about the home page.
const PAGES = [['home', ''], ['game', 'chainlink']];

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
let originBlocked = false;

async function run(label, path) {
  console.log(`\n  ${label} page  (${BASE}/${path})`);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('dj_cookie_ok', '1');
      localStorage.setItem('dj_seen_release', '99.0.0');
      localStorage.setItem('dj_seen_favs_intro', '1');   // keep it off the modal
    } catch (e) {}
  });
  const p = await ctx.newPage();

  const csp = [], errs = [];
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

  await p.goto(`${BASE}/${path}${path ? '/' : ''}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForFunction(() => window.DJAccount, null, { timeout: 15000 });
  await p.waitForTimeout(1200);

  const cid = await p.evaluate(() => window.DJConfig && DJConfig.googleClientId);
  check(`${label}: a Google client ID is configured`,
    !!cid && /\.apps\.googleusercontent\.com$/.test(cid), String(cid));

  await p.evaluate(() => DJAccount.open());
  await p.waitForTimeout(5000);

  const r = await p.evaluate(() => {
    const slot = document.getElementById('dj-gis-btn');
    const fb = document.getElementById('dj-acct-fallback');
    const box = (el) => (el ? el.getBoundingClientRect() : { width: 0, height: 0 });
    // What a PLAYER can see, not what an attribute claims. Google's button is
    // an iframe with no text of its own, so it is counted separately.
    const visibleButtons = [].slice.call(document.querySelectorAll('#dj-acct-body button'))
      .filter((el) => box(el).height > 0 && getComputedStyle(el).display !== 'none');
    return {
      tailwind: !!document.querySelector('script[src*="tailwindcss"]'),
      gsi: !!(window.google && window.google.accounts && window.google.accounts.id),
      iframes: slot ? slot.querySelectorAll('iframe').length : -1,
      slotH: Math.round(box(slot).height),
      // Must be 'normal': inheriting `color-scheme: dark` makes Google paint
      // a white card behind the pill on our dark modal.
      slotColorScheme: slot ? getComputedStyle(slot).colorScheme : 'no-el',
      fbDisplay: fb ? getComputedStyle(fb).display : 'no-el',
      fbRenderedH: Math.round(box(fb).height),
      visibleButtonText: visibleButtons.map((el) => (el.textContent || '').trim()),
    };
  });

  check(`${label}: Google's library loaded`, r.gsi === true);
  check(`${label}: exactly one Google button iframe`, r.iframes === 1, `iframes=${r.iframes}`);
  check(`${label}: the slot has real height`, r.slotH >= 30, `h=${r.slotH}`);
  // The assertion that would have caught it: rendered height, not `hidden`.
  check(`${label}: fallback button is not RENDERED`,
    r.fbRenderedH === 0 && r.fbDisplay === 'none',
    `display=${r.fbDisplay} height=${r.fbRenderedH}`);
  check(`${label}: no other visible button in the modal`,
    r.visibleButtonText.length === 0, JSON.stringify(r.visibleButtonText));
  check(`${label}: button slot forces color-scheme normal`,
    r.slotColorScheme === 'normal', `colorScheme=${r.slotColorScheme}`);
  check(`${label}: no unexpected CSP violations`, csp.length === 0, csp.slice(0, 2).join(' | '));
  check(`${label}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`       (tailwind on this page: ${r.tailwind})`);

  await ctx.close();
}

console.log(`\nGIS sign-in  ${BASE}`);
for (const [label, path] of PAGES) await run(label, path);
await b.close();

if (originBlocked) {
  console.log('\n  PENDING  an origin is not on the OAuth client yet.');
  console.log('           Google Cloud Console -> Clients -> the web client ->');
  console.log(`           Authorized JavaScript origins -> add ${new URL(BASE).origin}`);
  console.log('           Until then the button renders but does nothing.');
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
