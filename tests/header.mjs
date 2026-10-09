import { chromium } from 'playwright';
const B = 'https://dev.dailyjamm.com';
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
    const present = [r.trophy, r.bell, r.acct].filter((v) => v !== null);
    // Every control present should sit within ~90px of the right edge.
    const ok = present.length > 0 && present.every((v) => v < 95);
    if (!ok) bad++;
    console.log(`    ${ok ? 'ok  ' : 'FAIL'} ${(path || '(home)').padEnd(13)} gap-from-right  trophy=${r.trophy} bell=${r.bell} account=${r.acct}`);
  }
  await ctx.close();
}
await b.close();
console.log(`\n  ${bad === 0 ? 'all controls right-aligned' : bad + ' page/size combos wrong'}`);
process.exit(bad ? 1 : 0);
