// Header controls must be right-aligned on every page and every width.
//
//   node header.mjs
//
// WHAT THIS ASSERTS, AND WHY IT IS NOT A DISTANCE CAP
// The first version of this test required every control to sit within 95px of
// the right edge, and reported 14 failures against a header that was correctly
// aligned: with four round buttons the LEFTMOST one is ~116px in by
// construction, and the cap would have to be loosened every time a control was
// added. The invariant is not "close to the edge", it is:
//
//   - the rightmost control hugs the edge (header padding only), and
//   - the controls run in the intended order right-to-left:
//     account, bell, trophy - which is also the order they are injected in,
//     by account.js, notify.js and menu.js respectively.
//
// Controls are measured from the RIGHT edge, so a bigger number is further
// left. Only the controls actually present on a page are checked: the trophy
// hides itself on /leaderboards/, and the account button removes itself when
// the backend is unreachable.
import { chromium } from 'playwright';
const B = 'https://dev.dailyjamm.com';
const EDGE_MAX = 32;          // header side padding; nothing should exceed it
const PAGES = ['', 'leaderboards', 'about', 'releases', 'terms', 'privacy', 'chainlink', 'yachtdle'];
const SIZES = [[390, 844, 'mobile'], [1280, 800, 'desktop']];

const b = await chromium.launch({ channel: 'chrome', headless: true });
let bad = 0;
for (const [w, h, label] of SIZES) {
  console.log(`\n  ${label} (${w}px)`);
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.setItem('dj_cookie_ok','1'); } catch(e){} });
  const p = await ctx.newPage();
  for (const path of PAGES) {
    await p.goto(`${B}/${path}${path ? '/' : ''}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    const r = await p.evaluate(() => {
      const hdr = document.querySelector('header.site-header');
      if (!hdr) return null;
      const hw = hdr.getBoundingClientRect().width;
      const pick = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return Math.round(hw - b.right);           // px from the right edge
      };
      return { hw, trophy: pick('dj-boards-btn'), bell: pick('dj-bell-btn'), acct: pick('dj-account-btn') };
    });
    if (!r) { console.log(`    ${path || '(home)'}: no header`); continue; }

    // Expected order right-to-left, filtered to what the page actually has.
    const order = [r.acct, r.bell, r.trophy].filter((v) => v !== null);
    const why = [];
    if (!order.length) why.push('no controls found');
    else {
      if (order[0] > EDGE_MAX) why.push(`rightmost control ${order[0]}px from the edge`);
      for (let i = 1; i < order.length; i++) {
        if (order[i] <= order[i - 1]) why.push(`control ${i} not left of control ${i - 1}`);
      }
    }
    const ok = why.length === 0;
    if (!ok) bad++;
    console.log(`    ${ok ? 'ok  ' : 'FAIL'} ${(path || '(home)').padEnd(13)} gap-from-right  trophy=${r.trophy} bell=${r.bell} account=${r.acct}${ok ? '' : '  :: ' + why.join('; ')}`);
  }
  await ctx.close();
}
await b.close();
console.log(`\n  ${bad === 0 ? 'all controls right-aligned' : bad + ' page/size combos wrong'}`);
process.exit(bad ? 1 : 0);
