// Does the page's CSP actually let Google Analytics transmit?
//
// GA cannot be tested end to end anywhere but production: gtag('config') is
// hostname-gated to dailyjamm.com, so no beacon is ever attempted on dev or
// tst. That gate is also exactly why the broken connect-src survived so long -
// the only console that could have shown the violation was the live site's.
//
// So this probes the policy directly instead of waiting for a real beacon.
// It fires a fetch at each endpoint from page context and watches for a
// securitypolicyviolation event. A CSP refusal raises that event; an ordinary
// network or CORS failure does not, which is what separates "blocked by our
// own policy" from "Google said no" - only the first is our bug.
//
// The negative control matters as much as the probe: a listener that never
// fires proves nothing, so a host we know is disallowed must come back blocked.

// channel: 'chrome' - uses the Chrome already on the machine, as every module here does.
import { BASE, argOf, launch } from './lib.mjs';

const base = argOf('base', BASE);

// Hosts gtag actually posts to today. www.google.com is deliberately absent:
// that path is ads/conversion-linker related and allowing the whole domain
// would be far broader than analytics needs.
const ALLOW = [
  'https://www.google-analytics.com/g/collect?v=2&tid=G-XLRXG28EZV',
  'https://region1.google-analytics.com/g/collect?v=2&tid=G-XLRXG28EZV',
  'https://analytics.google.com/g/collect?v=2&tid=G-XLRXG28EZV',
  'https://stats.g.doubleclick.net/g/collect?v=2&tid=G-XLRXG28EZV',
];

// Negative control - nothing in connect-src covers this.
const DENY = ['https://example.invalid/csp-control'];

const PAGES = [
  '/', '/404.html', '/about/', '/releases/', '/terms/', '/privacy/', '/leaderboards/',
  '/themedle/', '/chainlink/', '/blackjackdle/', '/spelldle/', '/roulettedle/',
  '/holdle/', '/liarsdice/', '/netzero/', '/shutthebox/', '/yachtdle/',
];

let pass = 0; const fails = [];
const ok  = (m) => { pass++; };
const bad = (m) => fails.push(m);

const browser = await launch();
const page = await browser.newPage();

for (const path of PAGES) {
  const res = await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  if (!res || res.status() >= 400) { bad(`${path}: HTTP ${res && res.status()}`); continue; }

  // 1. The policy text itself, as served.
  const csp = await page.evaluate(() => {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return m ? m.getAttribute('content') : null;
  });
  if (!csp) { bad(`${path}: no CSP meta tag`); continue; }
  const connect = (csp.match(/connect-src([^;]*)/) || [])[1] || '';
  for (const need of ['*.google-analytics.com', 'analytics.google.com', 'stats.g.doubleclick.net']) {
    if (connect.includes(need)) ok(); else bad(`${path}: connect-src missing ${need}`);
  }

  // 2. The policy as the browser enforces it.
  const out = await page.evaluate(async ({ allow, deny }) => {
    const blocked = new Set();
    document.addEventListener('securitypolicyviolation', (e) => {
      blocked.add(e.blockedURI);
    });
    const probe = async (u) => {
      // no-cors keeps CORS out of it: the request still passes through CSP,
      // and an opaque response is a perfectly good "the browser let it leave".
      try { await fetch(u, { method: 'POST', mode: 'no-cors', body: '' }); } catch (_) {}
    };
    await Promise.all([...allow, ...deny].map(probe));
    await new Promise((r) => setTimeout(r, 250));
    return [...blocked];
  }, { allow: ALLOW, deny: DENY });

  const hit = (u) => out.some((b) => u.startsWith(b) || b.startsWith(new URL(u).origin));

  for (const u of ALLOW) {
    if (hit(u)) bad(`${path}: CSP blocked ${new URL(u).host}`); else ok();
  }
  for (const u of DENY) {
    if (hit(u)) ok(); else bad(`${path}: control host was NOT blocked - the probe cannot detect refusals, so the passes above are meaningless`);
  }
}

await browser.close();
console.log(`csp.mjs  ${pass} passed, ${fails.length} failed`);
fails.forEach((f) => console.log('  FAIL ' + f));
process.exit(fails.length ? 1 : 0);
