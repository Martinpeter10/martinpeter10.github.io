import { chromium } from 'playwright';
const B = process.argv[3] || 'https://dev.dailyjamm.com';
const b = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('dj_cookie_ok','1'); localStorage.setItem('dj_seen_release','99.0.0'); } catch(e){} });
const p = await ctx.newPage();
const csp = [], errs = [];
p.on('console', m => { const t = m.text();
  if (/Content Security Policy|Refused to/i.test(t)) csp.push(t);
  else if (m.type() === 'error' && !/favicon|clarity|gtag|google-analytics|accounts\.google\.com\/gsi\/log|401|403/i.test(t)) errs.push(t); });
p.on('pageerror', e => errs.push('UNCAUGHT: ' + e.message));

await p.goto(`${B}/chainlink/`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.DJAccount && DJAccount.isReady !== undefined, null, { timeout: 15000 });
await p.waitForTimeout(1500);

console.log('client id in config :', await p.evaluate(() => window.DJConfig && DJConfig.googleClientId));
await p.evaluate(() => DJAccount.open());
await p.waitForTimeout(4000);

const r = await p.evaluate(() => {
  const slot = document.getElementById('dj-gis-btn');
  const fb   = document.getElementById('dj-acct-fallback');
  return {
    slotExists: !!slot,
    slotHasIframe: !!(slot && slot.querySelector('iframe')),
    slotChildren: slot ? slot.children.length : -1,
    slotHeight: slot ? Math.round(slot.getBoundingClientRect().height) : -1,
    fallbackVisible: !!(fb && !fb.hidden),
    gsiLoaded: !!(window.google && window.google.accounts && window.google.accounts.id),
    msg: (document.getElementById('dj-acct-msg') || {}).textContent,
  };
});
console.log(r);
console.log('CSP violations :', csp.length ? csp : 'none');
console.log('page errors    :', errs.length ? errs : 'none');
await b.close();
process.exit(r.gsiLoaded && r.slotHasIframe && !r.fallbackVisible && csp.length === 0 ? 0 : 1);
